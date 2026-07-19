import { resetWarnOnceForTests, warnOnce } from './warn-once.js';

export const HOSTHOOKS_API_VERSION = 1 as const;
/** Advisory only — JS cannot preempt a synchronous callback. See api-contract.md. */
export const OBSERVER_BUDGET_MS = 25;
export { warnOnce } from './warn-once.js';

export type ProviderMessageObserver = (
  message: unknown,
  context: Readonly<{ provider: string }>,
) => void;

export type ProviderQueryOptionsContributor = (
  context: Readonly<{ provider: string; current: Readonly<Record<string, unknown>> }>,
) => Record<string, unknown> | null | undefined;

export type InboundBatchObserver = (
  context: Readonly<{ messageIds: readonly string[]; messages: readonly unknown[] }>,
) => void;

interface NamedRegistration<T> {
  name: string;
  callback: T;
}

const providerMessageObservers: NamedRegistration<ProviderMessageObserver>[] = [];
const providerQueryContributors: NamedRegistration<ProviderQueryOptionsContributor>[] = [];
const inboundBatchObservers: NamedRegistration<InboundBatchObserver>[] = [];

function assertRegistration(name: string, callback: unknown): void {
  if (!name.trim()) throw new Error('Hosthook registration name must not be empty');
  if (typeof callback !== 'function') throw new TypeError(`Hosthook "${name}" must be a function`);
}

export function registerProviderMessageObserver(
  name: string,
  observer: ProviderMessageObserver,
): () => void {
  return addRegistration(providerMessageObservers, name, observer);
}

export function registerProviderQueryOptionsContributor(
  name: string,
  contributor: ProviderQueryOptionsContributor,
): () => void {
  return addRegistration(providerQueryContributors, name, contributor);
}

export function registerInboundBatchObserver(
  name: string,
  observer: InboundBatchObserver,
): () => void {
  return addRegistration(inboundBatchObservers, name, observer);
}

export function runProviderMessageObservers(
  message: unknown,
  context: Readonly<{ provider: string }>,
): void {
  for (const registration of providerMessageObservers) {
    runObserver('provider-message', registration, () =>
      registration.callback(message, context),
    );
  }
}

export function runProviderQueryOptionsContributors(
  context: Readonly<{ provider: string }>,
): Record<string, unknown> {
  let current: Record<string, unknown> = {};
  for (const registration of providerQueryContributors) {
    try {
      const contribution = registration.callback({
        provider: context.provider,
        current: { ...current },
      });
      if (contribution == null) continue;
      if (typeof contribution !== 'object' || Array.isArray(contribution)) {
        warnOnce(
          `provider-query-malformed:${registration.name}`,
          `Provider query contributor "${registration.name}" returned a malformed value; skipping it.`,
        );
        continue;
      }
      current = { ...current, ...contribution };
    } catch (error) {
      warnOnce(
        `provider-query-throw:${registration.name}`,
        `Provider query contributor "${registration.name}" threw; skipping it.`,
        error,
      );
    }
  }
  return current;
}

export function runInboundBatchObservers(messages: readonly { id: string }[]): void {
  const context = {
    messageIds: messages.map((message) => message.id),
    messages: [...messages] as readonly unknown[],
  };
  for (const registration of inboundBatchObservers) {
    runObserver('inbound-batch', registration, () => registration.callback(context));
  }
}

export function getHosthooksCapabilities(): {
  apiVersion: typeof HOSTHOOKS_API_VERSION;
  features: {
    deliveryPolicy: false;
    outboundContentTransform: false;
    providerMessageObserver: true;
    providerQueryOptions: true;
    inboundBatchObserver: true;
    containerEnv: false;
  };
  counts: Record<string, number>;
} {
  return {
    apiVersion: HOSTHOOKS_API_VERSION,
    features: {
      deliveryPolicy: false,
      outboundContentTransform: false,
      providerMessageObserver: true,
      providerQueryOptions: true,
      inboundBatchObserver: true,
      containerEnv: false,
    },
    counts: {
      providerMessageObserver: providerMessageObservers.length,
      providerQueryOptions: providerQueryContributors.length,
      inboundBatchObserver: inboundBatchObservers.length,
    },
  };
}

function addRegistration<T>(
  registrations: NamedRegistration<T>[],
  name: string,
  callback: T,
): () => void {
  assertRegistration(name, callback);
  const registration = { name: name.trim(), callback };
  registrations.push(registration);
  return () => {
    const index = registrations.indexOf(registration);
    if (index >= 0) registrations.splice(index, 1);
  };
}

function runObserver(
  kind: string,
  registration: NamedRegistration<(...args: never[]) => unknown>,
  invoke: () => unknown,
): void {
  const started = performance.now();
  try {
    const result = invoke();
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      warnOnce(
        `${kind}-async:${registration.name}`,
        `Observer "${registration.name}" returned a Promise; observers must be synchronous and non-blocking.`,
      );
    }
  } catch (error) {
    warnOnce(
      `${kind}-throw:${registration.name}`,
      `Observer "${registration.name}" threw; continuing the ${kind} pipeline.`,
      error,
    );
  } finally {
    const elapsed = performance.now() - started;
    if (elapsed > OBSERVER_BUDGET_MS) {
      warnOnce(
        `${kind}-slow:${registration.name}`,
        `Observer "${registration.name}" took ${elapsed.toFixed(1)}ms; advisory budget is ${OBSERVER_BUDGET_MS}ms (not enforced — synchronous JS cannot be preempted).`,
      );
    }
  }
}

export type HosthooksCapabilitiesSnapshot = ReturnType<typeof getHosthooksCapabilities>;

export type HosthooksProbeResult =
  | ({ present: true } & HosthooksCapabilitiesSnapshot)
  | { present: false; reason: 'absent'; error?: unknown };

/**
 * Safe probe for product skills that dynamically load hosthooks.
 * Pass a loader that imports/calls getHosthooksCapabilities; import failures
 * and throws become `{ present: false }` instead of escaping to the caller.
 */
export function probeHosthooksCapabilities(
  load: () => HosthooksCapabilitiesSnapshot,
): HosthooksProbeResult {
  try {
    return { present: true, ...load() };
  } catch (error) {
    return { present: false, reason: 'absent', error };
  }
}

export function resetHosthooksForTests(): void {
  providerMessageObservers.length = 0;
  providerQueryContributors.length = 0;
  inboundBatchObservers.length = 0;
  resetWarnOnceForTests();
}
