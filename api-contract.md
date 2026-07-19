# API Contract — nanoclaw-hosthooks

Normative contract for `nanoclaw-hosthooks` API version **1**.

This package installs composable, append-only extension points. It does not
enable product behavior on its own. Skills such as `nanoclaw-webchat` and
`nanoclaw-agenttrace` register against these hooks.

## Capability probe

```ts
getHosthooksCapabilities(): {
  apiVersion: 1;
  features: {
    deliveryPolicy: boolean;
    outboundContentTransform: boolean;
    providerMessageObserver: boolean;
    providerQueryOptions: boolean;
    inboundBatchObserver: boolean;
    containerEnv: boolean;
  };
  counts: Record<string, number>;
};
```

- Import failure or missing modules → treat capabilities as **absent**.
- Never throw from a probe path used by product skills.

## Registration model

- All hooks use named `registerXXX(name, fn)` append registries.
- Registration returns an unregister function.
- Last-wins `setXXX` is not used.
- Product boot blocks (`startWebChat`, `startAgentTrace`, `startAdminApi`)
  remain owned by those packages.

## Host registry (`src/hosthooks.ts`)

### `registerDeliveryPolicy`

Opt-in engagement and delivery policy for the router fan-out.

```ts
type DeliveryPolicyResult = {
  engages?: boolean; // opt-in only: true forces engage; false/undefined ignored
  wake?: boolean;
  skipCommandGate?: boolean;
};
```

Merge rules:

- `engages`: OR across registrants; access/scope gates remain authoritative.
- `wake: false` sticks after a successful policy return.
- `skipCommandGate: true` sticks after a successful policy return.
- Throw or malformed result → fail closed: `wake → false`,
  `skipCommandGate → false`.

The accumulate security predicate is stock NanoClaw and is never rewritten:

```ts
} else if (
  agent.ignored_message_policy === 'accumulate' &&
  !(engages && (!accessOk || !scopeOk))
)
```

### `registerOutboundContentTransform`

Ordered pipeline before `deliveryAdapter.deliver`.

- Return a string to replace content.
- Return `null`/`undefined` to keep previous content.
- Throw or non-string → warn naming the registrant, keep previous, continue.

### `registerContainerEnvContributor`

Skill-global container environment contributor in `buildContainerArgs`.

- Return `Record<string, string | undefined>`.
- `undefined` values are skipped.
- Invalid keys, non-string values, or key collisions **throw**.
- Distinct from keyed `registerProviderContainerConfig`.

## Runner registry (`container/agent-runner/src/hosthooks.ts`)

### `registerProviderMessageObserver`

Hot-path observer after each Claude SDK activity yield.

- Must be synchronous and non-blocking.
- Promise returns warn once.
- Duration over 25ms warns once.
- Throw → warn naming the registrant and continue.

### `registerProviderQueryOptionsContributor`

Shallow-merge contributions into Claude SDK query options.

- Must be synchronous.
- Throw or malformed contribution → warn and skip that registrant.

### `registerInboundBatchObserver`

Outer poll-loop observer after `getPendingMessages` (system messages filtered).

- Same sync / non-blocking / 25ms budget contract as provider message observers.
- Fires when `messages.length > 0`, before the accumulate-only skip.

## Installer contract

Commands: `install`, `upgrade`, `sync-skill`, `verify`, `uninstall`.

- Compute every source transform before writing any host file.
- Commit with atomic temp + rename.
- Roll back committed files if a later write fails.
- Idempotent when already installed.
- Missing or ambiguous anchors abort without partial patching.
- Partial or corrupt markers fail verify and reinstall.

Required call-site files:

- `src/router.ts`
- `src/delivery.ts`
- `src/container-runner.ts`
- `container/agent-runner/src/providers/claude.ts`
- `container/agent-runner/src/poll-loop.ts`

Copied modules:

- `src/hosthooks.ts`
- `container/agent-runner/src/hosthooks.ts`
