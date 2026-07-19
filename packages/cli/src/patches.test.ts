import { describe, expect, it } from 'vitest';
import {
  FILE_TRANSFORMS,
  patchClaudeProvider,
  patchContainerRunner,
  patchDelivery,
  patchPollLoop,
  patchRouter,
  unpatchClaudeProvider,
  unpatchContainerRunner,
  unpatchDelivery,
  unpatchPollLoop,
  unpatchRouter,
} from './patches.js';
import { fixtureSources } from './test-fixtures.js';

const { router, delivery, claude, poll, container } = fixtureSources;

describe('source transforms', () => {
  it.each([
    ['router', router, patchRouter, unpatchRouter],
    ['delivery', delivery, patchDelivery, unpatchDelivery],
    ['claude', claude, patchClaudeProvider, unpatchClaudeProvider],
    ['poll', poll, patchPollLoop, unpatchPollLoop],
    ['container', container, patchContainerRunner, unpatchContainerRunner],
  ] as const)('%s installs idempotently and uninstalls to stock', (_name, source, install, uninstall) => {
    const patched = install(source);
    expect(patched).toContain('@nanoclaw-hosthooks');
    expect(install(patched)).toBe(patched);
    expect(uninstall(patched)).toBe(source);
    expect(uninstall(source)).toBe(source);
  });

  it('threads policy results without changing the accumulate predicate', () => {
    const patched = patchRouter(router);
    expect(patched).toContain(
      "agent.ignored_message_policy === 'accumulate' && !(engages && (!accessOk || !scopeOk))",
    );
    expect(patched).toContain('hosthooksPolicy.wake');
    expect(patched).toContain('hosthooksPolicy.skipCommandGate');
    expect(patched).toContain('if (!skipCommandGate &&');
  });

  it('adds all runner hooks at the real anchors', () => {
    expect(patchClaudeProvider(claude)).toContain('runProviderQueryOptionsContributors');
    expect(patchClaudeProvider(claude)).toContain('runProviderMessageObservers');
    expect(patchPollLoop(poll)).toContain('runInboundBatchObservers(messages)');
    expect(patchContainerRunner(container)).toContain('runContainerEnvContributors');
  });

  it('fails loudly for missing and ambiguous anchors', () => {
    expect(() => patchRouter("import x from 'x';")).toThrow('router engage policy');
    expect(() => patchDelivery(`${delivery}\n${delivery}`)).toThrow('delivery adapter call');
    expect(() => patchClaudeProvider("import x from 'x';")).toThrow('Claude query options');
    expect(() => patchPollLoop("import x from 'x';")).toThrow('poll-loop pending');
    expect(() => patchContainerRunner("import x from 'x';")).toThrow('container environment');
    expect(() => patchDelivery('const noImports = true;')).toThrow('import anchor');
  });

  it('exports the complete five-file transform surface', () => {
    expect(FILE_TRANSFORMS.map((transform) => transform.path)).toEqual([
      'src/router.ts',
      'src/delivery.ts',
      'container/agent-runner/src/providers/claude.ts',
      'container/agent-runner/src/poll-loop.ts',
      'src/container-runner.ts',
    ]);
  });

  it('rejects corrupt marked blocks during uninstall', () => {
    expect(() =>
      unpatchRouter(`// @nanoclaw-hosthooks:router-command-gate:begin\nbroken`),
    ).toThrow('Corrupt hosthooks block');
    expect(() =>
      patchPollLoop(
        `${poll}// @nanoclaw-hosthooks:poll-import:begin\nimport './hosthooks.js';\n// @nanoclaw-hosthooks:poll-import:end\n`,
      ),
    ).toThrow('Partial or corrupt');
    expect(() =>
      unpatchPollLoop(`${poll}// @nanoclaw-hosthooks:poll-observer:begin\nbroken`),
    ).toThrow('Corrupt hosthooks block');
  });
});
