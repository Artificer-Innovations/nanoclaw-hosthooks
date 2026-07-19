import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findNanoclawRoot,
  hostResourcesDir,
  packageRoot,
  runnerResourcesDir,
  skillDir,
} from './paths.js';

const roots: string[] = [];

function temporary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosthooks-paths-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('paths', () => {
  it('finds package and source resources from nested directories', () => {
    const root = temporary();
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"nanoclaw-hosthooks"}');
    fs.mkdirSync(path.join(root, 'packages/host/src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages/runner/src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/host/src/hosthooks.ts'), '');
    fs.writeFileSync(path.join(root, 'packages/runner/src/hosthooks.ts'), '');
    expect(packageRoot(path.join(root, 'packages/host'))).toBe(root);
    expect(skillDir(path.join(root, 'packages/host'))).toBe(path.join(root, 'skills/add-hosthooks'));
    expect(hostResourcesDir(path.join(root, 'packages/host'))).toBe(
      path.join(root, 'packages/host/src'),
    );
    expect(runnerResourcesDir(path.join(root, 'packages/runner'))).toBe(
      path.join(root, 'packages/runner/src'),
    );
  });

  it('falls back to bundled resources', () => {
    const root = temporary();
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"nanoclaw-hosthooks"}');
    expect(hostResourcesDir(root)).toBe(path.join(root, 'skills/add-hosthooks/resources/host'));
    expect(runnerResourcesDir(root)).toBe(path.join(root, 'skills/add-hosthooks/resources/runner'));
  });

  it('finds a NanoClaw root from a descendant', () => {
    const root = temporary();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'container/agent-runner/src/nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/router.ts'), '');
    fs.writeFileSync(path.join(root, 'container/agent-runner/src/poll-loop.ts'), '');
    expect(findNanoclawRoot(path.join(root, 'container/agent-runner/src/nested'))).toBe(root);
  });

  it('fails clearly when roots cannot be found', () => {
    const root = temporary();
    expect(() => packageRoot(root)).toThrow('package root');
    expect(() => findNanoclawRoot(root)).toThrow('NanoClaw root not found');
  });
});
