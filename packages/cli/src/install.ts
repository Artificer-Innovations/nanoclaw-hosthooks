import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { FILE_TRANSFORMS } from './patches.js';
import {
  findNanoclawRoot,
  HOST_COPY_RULES,
  hostResourcesDir,
  readPackageVersion,
  RUNNER_COPY_RULES,
  runnerResourcesDir,
  skillDir,
} from './paths.js';

interface PendingWrite {
  path: string;
  content: Buffer;
  previous: Buffer | null;
  mode: number | undefined;
}

export interface InstallResult {
  root: string;
  changed: string[];
  unchanged: string[];
  version: string;
  skillPath: string;
}

export function runInstall(root?: string): InstallResult {
  const nanoclawRoot = root ?? findNanoclawRoot();
  console.log(`Detected NanoClaw root: ${nanoclawRoot}`);
  const pending: PendingWrite[] = [];
  const unchanged: string[] = [];

  for (const file of FILE_TRANSFORMS) {
    const absolutePath = path.join(nanoclawRoot, file.path);
    if (!fs.existsSync(absolutePath)) throw new Error(`Missing required host file: ${file.path}`);
    const source = fs.readFileSync(absolutePath, 'utf8');
    const next = file.transform(source);
    stageIfChanged(pending, unchanged, absolutePath, file.path, Buffer.from(next));
  }

  stageResources(pending, unchanged, nanoclawRoot, hostResourcesDir(), HOST_COPY_RULES);
  stageResources(pending, unchanged, nanoclawRoot, runnerResourcesDir(), RUNNER_COPY_RULES);
  commitWrites(pending);

  const skillPath = syncSkillToFork(nanoclawRoot);
  return {
    root: nanoclawRoot,
    changed: pending.map((write) => path.relative(nanoclawRoot, write.path)),
    unchanged,
    version: readPackageVersion(),
    skillPath,
  };
}

export function runUpgrade(root?: string): InstallResult {
  return runInstall(root);
}

export function runVerify(root?: string): { root: string; ok: boolean; issues: string[] } {
  const nanoclawRoot = root ?? findNanoclawRoot();
  const issues: string[] = [];

  for (const file of FILE_TRANSFORMS) {
    const absolutePath = path.join(nanoclawRoot, file.path);
    if (!fs.existsSync(absolutePath)) {
      issues.push(`missing ${file.path}`);
      continue;
    }
    const source = fs.readFileSync(absolutePath, 'utf8');
    try {
      if (file.transform(source) !== source) {
        issues.push(`${file.path} missing hosthooks call sites`);
      }
    } catch (error) {
      issues.push(
        `${file.path} has invalid hosthooks call sites: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  for (const rule of [...HOST_COPY_RULES, ...RUNNER_COPY_RULES]) {
    if (!fs.existsSync(path.join(nanoclawRoot, rule.dest))) issues.push(`missing ${rule.dest}`);
  }
  return { root: nanoclawRoot, ok: issues.length === 0, issues };
}

export function runUninstall(root?: string): {
  root: string;
  changed: string[];
  removed: string[];
} {
  const nanoclawRoot = root ?? findNanoclawRoot();
  const pending: PendingWrite[] = [];
  const unchanged: string[] = [];

  for (const file of FILE_TRANSFORMS) {
    const absolutePath = path.join(nanoclawRoot, file.path);
    if (!fs.existsSync(absolutePath)) continue;
    const source = fs.readFileSync(absolutePath, 'utf8');
    const next = file.uninstall(source);
    stageIfChanged(pending, unchanged, absolutePath, file.path, Buffer.from(next));
  }
  commitWrites(pending);

  const removed: string[] = [];
  for (const rule of [...HOST_COPY_RULES, ...RUNNER_COPY_RULES]) {
    const target = path.join(nanoclawRoot, rule.dest);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      removed.push(rule.dest);
    }
  }
  const installedSkill = path.join(nanoclawRoot, '.claude/skills/add-hosthooks');
  if (fs.existsSync(installedSkill)) {
    fs.rmSync(installedSkill, { recursive: true, force: true });
    removed.push('.claude/skills/add-hosthooks');
  }
  return {
    root: nanoclawRoot,
    changed: pending.map((write) => path.relative(nanoclawRoot, write.path)),
    removed,
  };
}

export function syncSkillToFork(
  nanoclawRoot: string,
  source: string = skillDir(),
): string {
  const destination = path.join(nanoclawRoot, '.claude/skills/add-hosthooks');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  copyDirectory(source, destination);
  return destination;
}

export function printInstallNextSteps(
  result: InstallResult,
  options: { upgraded?: boolean } = {},
): void {
  console.log(
    `${options.upgraded ? 'Upgraded' : 'Installed'} nanoclaw-hosthooks@${result.version} into ${result.root}`,
  );
  console.log(`Changed ${result.changed.length} files; ${result.unchanged.length} already current.`);
  console.log(`Synced skill → ${result.skillPath}`);
  console.log('\nNext steps:');
  console.log('  1. pnpm run build');
  console.log('  2. ./container/build.sh   # runner hooks live in the container image');
  console.log('  3. pnpm exec nanoclaw-hosthooks verify');
  console.log('  4. Install or upgrade the skills that register hosthooks.');
  console.log('  5. Restart the NanoClaw host service.');
}

function stageResources(
  pending: PendingWrite[],
  unchanged: string[],
  root: string,
  resources: string,
  rules: { source: string; dest: string }[],
): void {
  for (const rule of rules) {
    const source = path.join(resources, rule.source);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing bundled resource: ${rule.source}. Run pnpm run build.`);
    }
    stageIfChanged(
      pending,
      unchanged,
      path.join(root, rule.dest),
      rule.dest,
      fs.readFileSync(source),
    );
  }
}

function stageIfChanged(
  pending: PendingWrite[],
  unchanged: string[],
  absolutePath: string,
  relativePath: string,
  content: Buffer,
): void {
  const exists = fs.existsSync(absolutePath);
  const previous = exists ? fs.readFileSync(absolutePath) : null;
  if (previous?.equals(content)) {
    unchanged.push(relativePath);
    return;
  }
  pending.push({
    path: absolutePath,
    content,
    previous,
    mode: exists ? fs.statSync(absolutePath).mode : undefined,
  });
}

function commitWrites(writes: PendingWrite[]): void {
  const committed: PendingWrite[] = [];
  try {
    for (const write of writes) {
      atomicWrite(write.path, write.content, write.mode);
      committed.push(write);
    }
  } catch (error) {
    for (const write of committed.reverse()) {
      if (write.previous === null) fs.rmSync(write.path, { force: true });
      else atomicWrite(write.path, write.previous, write.mode);
    }
    throw error;
  }
}

function atomicWrite(target: string, content: Buffer, mode?: number): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.hosthooks-${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, content, mode === undefined ? undefined : { mode });
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function copyDirectory(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(destination)) {
    fs.rmSync(path.join(destination, entry), { recursive: true, force: true });
  }
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else fs.copyFileSync(from, to);
  }
}
