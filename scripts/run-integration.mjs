#!/usr/bin/env node
/**
 * Integration: build package → prepare fixture → CLI install → verify → uninstall.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`${cmd} ${args.join(' ')} failed with ${result.status}`);
  }
  return result;
}

console.log('Building package...');
run('pnpm', ['run', 'build']);

console.log('Preparing host fixture...');
run('node', ['scripts/prepare-host-fixture.mjs']);

const fixtureSrc = path.join(root, 'test/fixtures/nanoclaw-host');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hosthooks-integration-'));
fs.cpSync(fixtureSrc, work, { recursive: true });
console.log(`Workdir: ${work}`);

const bin = path.join(root, 'dist/cli/bin.js');
run('node', [bin, 'install', '--path', work]);
run('node', [bin, 'verify', '--path', work]);

const required = [
  'src/hosthooks.ts',
  'src/warn-once.ts',
  'container/agent-runner/src/hosthooks.ts',
  'container/agent-runner/src/warn-once.ts',
  '.claude/skills/add-hosthooks/SKILL.md',
];
for (const relativePath of required) {
  if (!fs.existsSync(path.join(work, relativePath))) {
    throw new Error(`missing after install: ${relativePath}`);
  }
}

const router = fs.readFileSync(path.join(work, 'src/router.ts'), 'utf8');
if (!router.includes('@nanoclaw-hosthooks:router-policy:begin')) {
  throw new Error('router policy patch missing after install');
}
if (
  !router.includes(
    "agent.ignored_message_policy === 'accumulate' && !(engages && (!accessOk || !scopeOk))",
  )
) {
  throw new Error('accumulate security predicate was rewritten');
}

const container = fs.readFileSync(path.join(work, 'src/container-runner.ts'), 'utf8');
if (!container.includes('function args(providerContribution')) {
  throw new Error('container fixture lost providerContribution parameter');
}
if (!container.includes('providerContribution.env')) {
  throw new Error('container-env patch missing providerContribution.env occupied-keys');
}

run('node', [bin, 'upgrade', '--path', work]);
run('node', [bin, 'uninstall', '--path', work]);

for (const relativePath of [
  'src/hosthooks.ts',
  'src/warn-once.ts',
  'container/agent-runner/src/hosthooks.ts',
  'container/agent-runner/src/warn-once.ts',
  '.claude/skills/add-hosthooks',
]) {
  if (fs.existsSync(path.join(work, relativePath))) {
    throw new Error(`still present after uninstall: ${relativePath}`);
  }
}

const stockRouter = fs.readFileSync(path.join(fixtureSrc, 'src/router.ts'), 'utf8');
const restoredRouter = fs.readFileSync(path.join(work, 'src/router.ts'), 'utf8');
if (restoredRouter !== stockRouter) {
  throw new Error('router.ts did not restore to stock fixture content');
}

fs.rmSync(work, { recursive: true, force: true });
console.log('Integration OK');
