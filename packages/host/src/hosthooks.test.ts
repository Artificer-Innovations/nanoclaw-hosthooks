import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getHosthooksCapabilities,
  probeHosthooksCapabilities,
  registerContainerEnvContributor,
  registerDeliveryPolicy,
  registerOutboundContentTransform,
  resetHosthooksForTests,
  runContainerEnvContributors,
  runDeliveryPolicies,
  runOutboundContentTransforms,
  warnOnce,
} from './hosthooks.js';

const basePolicyContext = {
  event: {},
  parsed: {},
  agent: {},
  agentGroup: {},
  messagingGroup: {},
  messageText: 'hello',
  isMention: false,
  effectiveThreadId: null,
  defaultEngages: false,
};

afterEach(() => {
  resetHosthooksForTests();
  vi.restoreAllMocks();
});

describe('host hook registries', () => {
  it('composes delivery policies in order with opt-in engagement', () => {
    const states: boolean[] = [];
    registerDeliveryPolicy('first', ({ current }) => {
      states.push(current.engages);
      return { engages: true, wake: false };
    });
    registerDeliveryPolicy('second', ({ current }) => {
      states.push(current.engages);
      return { engages: false, wake: true, skipCommandGate: true };
    });

    expect(runDeliveryPolicies(basePolicyContext)).toEqual({
      engages: true,
      wake: false,
      skipCommandGate: true,
    });
    expect(states).toEqual([false, true]);
  });

  it('fails closed and warns once for throws and malformed results', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerDeliveryPolicy('throws', () => {
      throw new Error('boom');
    });
    registerDeliveryPolicy('bad', () => 'bad' as never);
    registerDeliveryPolicy('empty', () => undefined);

    expect(runDeliveryPolicies({ ...basePolicyContext, defaultEngages: true })).toEqual({
      engages: true,
      wake: false,
      skipCommandGate: false,
    });
    runDeliveryPolicies(basePolicyContext);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('runs outbound transforms as an isolated ordered pipeline', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const remove = registerOutboundContentTransform('prefix', ({ content }) => `a:${content}`);
    registerOutboundContentTransform('empty', () => null);
    registerOutboundContentTransform('bad', () => 42 as never);
    registerOutboundContentTransform('throws', () => {
      throw new Error('no');
    });
    registerOutboundContentTransform('suffix', ({ content }) => `${content}:z`);

    const context = { content: 'x', message: {}, session: {}, agentGroup: {}, parsed: {} };
    expect(runOutboundContentTransforms(context)).toBe('a:x:z');
    remove();
    remove();
    expect(runOutboundContentTransforms(context)).toBe('x:z');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('validates registrations and reports capabilities', () => {
    expect(() => registerDeliveryPolicy('', () => null)).toThrow('must not be empty');
    expect(() => registerDeliveryPolicy('bad', null as never)).toThrow(TypeError);
    const remove = registerDeliveryPolicy('ok', () => null);
    registerOutboundContentTransform('out', () => undefined);
    expect(getHosthooksCapabilities()).toMatchObject({
      apiVersion: 1,
      features: { deliveryPolicy: true, outboundContentTransform: true },
      counts: { deliveryPolicy: 1, outboundContentTransform: 1 },
    });
    remove();
  });

  it('merges environment contributors and rejects collisions and malformed values', () => {
    registerContainerEnvContributor('one', () => ({ A: '1', SKIP: undefined }));
    registerContainerEnvContributor('two', () => ({ B_2: '2' }));
    expect(runContainerEnvContributors(['TZ'])).toEqual({ A: '1', B_2: '2' });

    registerContainerEnvContributor('collision', () => ({ A: 'other' }));
    expect(() => runContainerEnvContributors()).toThrow('conflicts');
    resetHosthooksForTests();
    registerContainerEnvContributor('core collision', () => ({ TZ: 'other' }));
    expect(() => runContainerEnvContributors(['TZ'])).toThrow('NanoClaw core');
    resetHosthooksForTests();
    registerContainerEnvContributor('bad key', () => ({ 'NOT-VALID': 'x' }));
    expect(() => runContainerEnvContributors()).toThrow('invalid key');
    resetHosthooksForTests();
    registerContainerEnvContributor('bad value', () => ({ A: 1 as never }));
    expect(() => runContainerEnvContributors()).toThrow('non-string');
    resetHosthooksForTests();
    registerContainerEnvContributor('bad result', () => [] as never);
    expect(() => runContainerEnvContributors()).toThrow('malformed');
  });

  it('warns only once with and without an error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnOnce('a', 'message');
    warnOnce('a', 'message');
    warnOnce('b', 'message', new Error('detail'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('probes capabilities without throwing on loader failure', () => {
    expect(probeHosthooksCapabilities(() => getHosthooksCapabilities()).present).toBe(true);
    expect(
      probeHosthooksCapabilities(() => {
        throw new Error('import failed');
      }),
    ).toEqual({ present: false, reason: 'absent', error: expect.any(Error) });
  });
});
