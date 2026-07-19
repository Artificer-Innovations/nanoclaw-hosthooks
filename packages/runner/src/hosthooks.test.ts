import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getHosthooksCapabilities,
  probeHosthooksCapabilities,
  registerInboundBatchObserver,
  registerProviderMessageObserver,
  registerProviderQueryOptionsContributor,
  resetHosthooksForTests,
  runInboundBatchObservers,
  runProviderMessageObservers,
  runProviderQueryOptionsContributors,
  warnOnce,
} from './hosthooks.js';

afterEach(() => {
  resetHosthooksForTests();
  vi.restoreAllMocks();
});

describe('runner hook registries', () => {
  it('isolates observer failures and reports async and slow observers once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const calls: string[] = [];
    registerProviderMessageObserver('ok', () => calls.push('ok'));
    registerProviderMessageObserver('throw', () => {
      throw new Error('boom');
    });
    registerProviderMessageObserver('async', (() => Promise.resolve()) as never);
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(0).mockReturnValueOnce(30);

    runProviderMessageObservers({}, { provider: 'claude' });
    runProviderMessageObservers({}, { provider: 'claude' });
    expect(calls).toEqual(['ok', 'ok']);
    expect(warn.mock.calls.flat().join(' ')).toContain('throw');
    expect(warn.mock.calls.flat().join(' ')).toContain('Promise');
    expect(warn.mock.calls.flat().join(' ')).toContain('advisory');
  });

  it('runs inbound observers with immutable-shaped batch context', () => {
    const seen: unknown[] = [];
    const remove = registerInboundBatchObserver('trace', (context) => seen.push(context));
    runInboundBatchObservers([{ id: 'a' }, { id: 'b' }]);
    remove();
    remove();
    runInboundBatchObservers([{ id: 'c' }]);
    expect(seen).toEqual([
      {
        messageIds: ['a', 'b'],
        messages: [{ id: 'a' }, { id: 'b' }],
      },
    ]);
  });

  it('shallow-merges query contributors and skips malformed or throwing ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerProviderQueryOptionsContributor('one', () => ({ a: 1, same: 'first' }));
    registerProviderQueryOptionsContributor('empty', () => null);
    registerProviderQueryOptionsContributor('bad', () => [] as never);
    registerProviderQueryOptionsContributor('throw', () => {
      throw new Error('boom');
    });
    registerProviderQueryOptionsContributor('two', ({ current }) => ({
      saw: current.a,
      same: 'second',
    }));
    expect(runProviderQueryOptionsContributors({ provider: 'claude' })).toEqual({
      a: 1,
      same: 'second',
      saw: 1,
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('validates registrations, supports unregister, and reports capabilities', () => {
    expect(() => registerProviderMessageObserver('', () => undefined)).toThrow();
    expect(() => registerProviderMessageObserver('bad', null as never)).toThrow(TypeError);
    const remove = registerProviderMessageObserver('messages', () => undefined);
    registerProviderQueryOptionsContributor('options', () => undefined);
    registerInboundBatchObserver('batch', () => undefined);
    expect(getHosthooksCapabilities()).toMatchObject({
      apiVersion: 1,
      counts: {
        providerMessageObserver: 1,
        providerQueryOptions: 1,
        inboundBatchObserver: 1,
      },
    });
    remove();
  });

  it('warns once directly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnOnce('plain', 'plain');
    warnOnce('error', 'error', new Error('x'));
    warnOnce('plain', 'plain');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('probes capabilities without throwing on loader failure', () => {
    expect(probeHosthooksCapabilities(() => getHosthooksCapabilities()).present).toBe(true);
    expect(
      probeHosthooksCapabilities(() => {
        throw new Error('missing');
      }).present,
    ).toBe(false);
  });
});
