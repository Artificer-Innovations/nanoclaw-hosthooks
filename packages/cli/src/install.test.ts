import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  printInstallNextSteps,
  runInstall,
  runUninstall,
  runUpgrade,
  runVerify,
  syncSkillToFork,
} from './install.js';
import { fixtureSources } from './test-fixtures.js';

const roots: string[] = [];

function makeHost(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosthooks-test-'));
  roots.push(root);
  const files: Record<string, string> = {
    'src/router.ts': fixtureSources.router,
    'src/delivery.ts': fixtureSources.delivery,
    'container/agent-runner/src/providers/claude.ts': fixtureSources.claude,
    'container/agent-runner/src/poll-loop.ts': fixtureSources.poll,
    'src/container-runner.ts': fixtureSources.container,
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('installer', () => {
  it('installs, verifies, upgrades idempotently, and uninstalls', () => {
    const root = makeHost();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const installed = runInstall(root);
    expect(installed.changed).toHaveLength(9);
    expect(installed.version).toBe('0.1.0');
    expect(fs.existsSync(path.join(root, '.claude/skills/add-hosthooks/SKILL.md'))).toBe(true);
    expect(runVerify(root)).toEqual({ root, ok: true, issues: [] });

    const upgraded = runUpgrade(root);
    expect(upgraded.changed).toEqual([]);
    expect(upgraded.unchanged).toHaveLength(9);
    printInstallNextSteps(upgraded, { upgraded: true });
    expect(log.mock.calls.flat().join(' ')).toContain('Upgraded');

    const removed = runUninstall(root);
    expect(removed.changed).toHaveLength(5);
    expect(removed.removed).toContain('src/hosthooks.ts');
    expect(removed.removed).toContain('src/warn-once.ts');
    expect(fs.readFileSync(path.join(root, 'src/router.ts'), 'utf8')).toBe(fixtureSources.router);
  });

  it('computes every transform before writing any file', () => {
    const root = makeHost();
    const routerPath = path.join(root, 'src/router.ts');
    const original = fs.readFileSync(routerPath, 'utf8');
    fs.writeFileSync(path.join(root, 'src/delivery.ts'), "import x from 'x';");
    expect(() => runInstall(root)).toThrow('delivery adapter call');
    expect(fs.readFileSync(routerPath, 'utf8')).toBe(original);
    expect(fs.existsSync(path.join(root, 'src/hosthooks.ts'))).toBe(false);
  });

  it('reports missing files and call sites during verification', () => {
    const root = makeHost();
    fs.rmSync(path.join(root, 'src/delivery.ts'));
    const result = runVerify(root);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('missing src/delivery.ts');
    expect(result.issues).toContain('src/router.ts missing hosthooks call sites');
    expect(result.issues).toContain('missing src/hosthooks.ts');
  });

  it('reports partial or corrupt hook call sites', () => {
    const root = makeHost();
    runInstall(root);
    const routerPath = path.join(root, 'src/router.ts');
    const router = fs.readFileSync(routerPath, 'utf8').replace(
      '// @nanoclaw-hosthooks:router-command-gate:end',
      '// missing hosthooks end marker',
    );
    fs.writeFileSync(routerPath, router);
    const result = runVerify(root);
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain('invalid hosthooks call sites');
  });

  it('syncs the bundled skill independently', () => {
    const root = makeHost();
    const source = path.join(root, 'source-skill');
    fs.mkdirSync(path.join(source, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(source, 'one.md'), 'one');
    fs.writeFileSync(path.join(source, 'nested/two.md'), 'two');
    const destination = syncSkillToFork(root, source);
    expect(fs.readFileSync(path.join(destination, 'nested/two.md'), 'utf8')).toBe('two');
    fs.writeFileSync(path.join(destination, 'stale'), 'stale');
    syncSkillToFork(root, source);
    expect(fs.existsSync(path.join(destination, 'stale'))).toBe(false);
  });

  it('leaves an uninstalled stock host unchanged', () => {
    const root = makeHost();
    expect(runUninstall(root)).toEqual({ root, changed: [], removed: [] });
  });
});
