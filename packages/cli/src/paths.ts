import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CopyRule {
  source: string;
  dest: string;
}

export const HOST_COPY_RULES: CopyRule[] = [
  { source: 'warn-once.ts', dest: 'src/warn-once.ts' },
  { source: 'hosthooks.ts', dest: 'src/hosthooks.ts' },
];

export const RUNNER_COPY_RULES: CopyRule[] = [
  { source: 'warn-once.ts', dest: 'container/agent-runner/src/warn-once.ts' },
  { source: 'hosthooks.ts', dest: 'container/agent-runner/src/hosthooks.ts' },
];

export function packageRoot(startDir: string = __dirname): string {
  let dir = startDir;
  for (;;) {
    const packagePath = path.join(dir, 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { name?: string };
      if (pkg.name === 'nanoclaw-hosthooks') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate nanoclaw-hosthooks package root');
}

export function skillDir(startDir: string = __dirname): string {
  return path.join(packageRoot(startDir), 'skills/add-hosthooks');
}

export function hostResourcesDir(startDir: string = __dirname): string {
  const source = path.join(packageRoot(startDir), 'packages/host/src');
  if (fs.existsSync(path.join(source, 'hosthooks.ts'))) return source;
  return path.join(skillDir(startDir), 'resources/host');
}

export function runnerResourcesDir(startDir: string = __dirname): string {
  const source = path.join(packageRoot(startDir), 'packages/runner/src');
  if (fs.existsSync(path.join(source, 'hosthooks.ts'))) return source;
  return path.join(skillDir(startDir), 'resources/runner');
}

export function findNanoclawRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (
      fs.existsSync(path.join(dir, 'src/router.ts')) &&
      fs.existsSync(path.join(dir, 'container/agent-runner/src/poll-loop.ts'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'NanoClaw root not found (expected src/router.ts and container/agent-runner/src/poll-loop.ts). Use --path.',
  );
}

export function readPackageVersion(): string {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf8'),
  ) as { version?: string };
  return pkg.version ?? '0.0.0';
}
