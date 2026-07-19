export const HOSTHOOKS_API_VERSION = 1 as const;

export interface ValidatedInboundParse {
  text?: string;
  sender?: string;
  senderId?: string;
  [key: string]: unknown;
}

export interface DeliveryPolicyState {
  engages: boolean;
  wake: boolean;
  skipCommandGate: boolean;
}

export interface DeliveryPolicyResult {
  engages?: boolean;
  wake?: boolean;
  skipCommandGate?: boolean;
}

export interface DeliveryPolicyContext {
  event: unknown;
  parsed: ValidatedInboundParse;
  agent: unknown;
  agentGroup: unknown;
  messagingGroup: unknown;
  messageText: string;
  isMention: boolean;
  effectiveThreadId: string | null;
  defaultEngages: boolean;
  current: Readonly<DeliveryPolicyState>;
}

export type DeliveryPolicy = (
  context: DeliveryPolicyContext,
) => DeliveryPolicyResult | null | undefined;

export interface OutboundContentTransformContext {
  content: string;
  message: unknown;
  session: unknown;
  agentGroup: unknown;
  parsed: unknown;
}

export type OutboundContentTransform = (
  context: OutboundContentTransformContext,
) => string | null | undefined;

export type ContainerEnvContributor = () =>
  | Record<string, string | undefined>
  | null
  | undefined;

interface NamedRegistration<T> {
  name: string;
  callback: T;
}

const deliveryPolicies: NamedRegistration<DeliveryPolicy>[] = [];
const outboundTransforms: NamedRegistration<OutboundContentTransform>[] = [];
const containerEnvContributors: NamedRegistration<ContainerEnvContributor>[] = [];
const warned = new Set<string>();

function assertRegistration(name: string, callback: unknown): void {
  if (!name.trim()) throw new Error('Hosthook registration name must not be empty');
  if (typeof callback !== 'function') throw new TypeError(`Hosthook "${name}" must be a function`);
}

export function warnOnce(key: string, message: string, error?: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  if (error === undefined) console.warn(`[nanoclaw-hosthooks] ${message}`);
  else console.warn(`[nanoclaw-hosthooks] ${message}`, error);
}

export function registerDeliveryPolicy(name: string, policy: DeliveryPolicy): () => void {
  assertRegistration(name, policy);
  const registration = { name: name.trim(), callback: policy };
  deliveryPolicies.push(registration);
  return () => removeRegistration(deliveryPolicies, registration);
}

export function registerOutboundContentTransform(
  name: string,
  transform: OutboundContentTransform,
): () => void {
  assertRegistration(name, transform);
  const registration = { name: name.trim(), callback: transform };
  outboundTransforms.push(registration);
  return () => removeRegistration(outboundTransforms, registration);
}

export function registerContainerEnvContributor(
  name: string,
  contributor: ContainerEnvContributor,
): () => void {
  assertRegistration(name, contributor);
  const registration = { name: name.trim(), callback: contributor };
  containerEnvContributors.push(registration);
  return () => removeRegistration(containerEnvContributors, registration);
}

export function runDeliveryPolicies(
  context: Omit<DeliveryPolicyContext, 'current'>,
): DeliveryPolicyState {
  let current: DeliveryPolicyState = {
    engages: context.defaultEngages,
    wake: true,
    skipCommandGate: false,
  };

  for (const registration of deliveryPolicies) {
    try {
      const result = registration.callback({ ...context, current: { ...current } });
      if (!isDeliveryPolicyResult(result)) {
        current = { ...current, wake: false, skipCommandGate: false };
        warnOnce(
          `delivery-policy-malformed:${registration.name}`,
          `Delivery policy "${registration.name}" returned a malformed result; using fail-closed delivery defaults.`,
        );
        continue;
      }
      current = {
        engages: current.engages || result?.engages === true,
        wake: result?.wake === false ? false : current.wake,
        skipCommandGate: result?.skipCommandGate === true || current.skipCommandGate,
      };
    } catch (error) {
      current = { ...current, wake: false, skipCommandGate: false };
      warnOnce(
        `delivery-policy-throw:${registration.name}`,
        `Delivery policy "${registration.name}" threw; using fail-closed delivery defaults.`,
        error,
      );
    }
  }
  return current;
}

export function runOutboundContentTransforms(
  context: OutboundContentTransformContext,
): string {
  let content = context.content;
  for (const registration of outboundTransforms) {
    try {
      const result = registration.callback({ ...context, content });
      if (result == null) continue;
      if (typeof result !== 'string') {
        warnOnce(
          `outbound-transform-malformed:${registration.name}`,
          `Outbound transform "${registration.name}" returned a non-string value; keeping previous content.`,
        );
        continue;
      }
      content = result;
    } catch (error) {
      warnOnce(
        `outbound-transform-throw:${registration.name}`,
        `Outbound transform "${registration.name}" threw; keeping previous content.`,
        error,
      );
    }
  }
  return content;
}

export function runContainerEnvContributors(
  occupiedKeys: Iterable<string> = [],
): Record<string, string> {
  const owners = new Map<string, string>();
  for (const key of occupiedKeys) owners.set(key, 'NanoClaw core');
  const merged: Record<string, string> = {};

  for (const registration of containerEnvContributors) {
    const contribution = registration.callback();
    if (contribution == null) continue;
    if (typeof contribution !== 'object' || Array.isArray(contribution)) {
      throw new TypeError(
        `Container env contributor "${registration.name}" returned a malformed value`,
      );
    }
    for (const [key, value] of Object.entries(contribution)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(
          `Container env contributor "${registration.name}" returned invalid key "${key}"`,
        );
      }
      if (value === undefined) continue;
      if (typeof value !== 'string') {
        throw new TypeError(
          `Container env contributor "${registration.name}" returned non-string value for "${key}"`,
        );
      }
      const previousOwner = owners.get(key);
      if (previousOwner) {
        throw new Error(
          `Container env key "${key}" from "${registration.name}" conflicts with ${previousOwner}`,
        );
      }
      owners.set(key, `"${registration.name}"`);
      merged[key] = value;
    }
  }
  return merged;
}

export function getHosthooksCapabilities(): {
  apiVersion: typeof HOSTHOOKS_API_VERSION;
  features: {
    deliveryPolicy: true;
    outboundContentTransform: true;
    providerMessageObserver: false;
    providerQueryOptions: false;
    inboundBatchObserver: false;
    containerEnv: true;
  };
  counts: Record<string, number>;
} {
  return {
    apiVersion: HOSTHOOKS_API_VERSION,
    features: {
      deliveryPolicy: true,
      outboundContentTransform: true,
      providerMessageObserver: false,
      providerQueryOptions: false,
      inboundBatchObserver: false,
      containerEnv: true,
    },
    counts: {
      deliveryPolicy: deliveryPolicies.length,
      outboundContentTransform: outboundTransforms.length,
      containerEnv: containerEnvContributors.length,
    },
  };
}

function isDeliveryPolicyResult(value: unknown): value is DeliveryPolicyResult | null | undefined {
  if (value == null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    (result.engages === undefined || typeof result.engages === 'boolean') &&
    (result.wake === undefined || typeof result.wake === 'boolean') &&
    (result.skipCommandGate === undefined || typeof result.skipCommandGate === 'boolean')
  );
}

function removeRegistration<T>(
  registrations: NamedRegistration<T>[],
  registration: NamedRegistration<T>,
): void {
  const index = registrations.indexOf(registration);
  if (index >= 0) registrations.splice(index, 1);
}

export function resetHosthooksForTests(): void {
  deliveryPolicies.length = 0;
  outboundTransforms.length = 0;
  containerEnvContributors.length = 0;
  warned.clear();
}
