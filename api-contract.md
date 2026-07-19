# API Contract — nanoclaw-hosthooks

Normative contract for `nanoclaw-hosthooks` API version **1**.

This package installs composable, append-only extension points. It does not
enable product behavior on its own. Skills such as `nanoclaw-webchat` and
`nanoclaw-agenttrace` register against these hooks.

## Capability probe

```ts
getHosthooksCapabilities(): {
  apiVersion: 1;
  features: { ... };
  counts: Record<string, number>;
};

probeHosthooksCapabilities(load): 
  | { present: true; apiVersion; features; counts }
  | { present: false; reason: 'absent'; error? };
```

- `getHosthooksCapabilities()` is a synchronous snapshot of the loaded registry.
  It does not itself perform I/O or dynamic import.
- Product skills that dynamically import hosthooks should use
  `probeHosthooksCapabilities(() => getHosthooksCapabilities())` (or wrap their
  own `import()` / `require()` in that loader). Import failure or throw →
  `{ present: false }` — never an uncaught exception from the probe path.
- `apiVersion` is the gate for shape changes; consumers should reject hosts
  whose version is below the required minimum.

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

- Must be synchronous and non-blocking by contract.
- Promise returns warn once.
- `OBSERVER_BUDGET_MS` (25ms) is **advisory/telemetry only**, not an enforced
  cap. JavaScript cannot preempt a running synchronous callback without a
  worker; a 500ms observer still stalls the poll/provider loop for its full
  duration before the warning fires. Skill authors must keep observers cheap.
- Throw → warn naming the registrant and continue.

### `registerProviderQueryOptionsContributor`

Shallow-merge contributions into Claude SDK query options.

- Must be synchronous.
- Throw or malformed contribution → warn and skip that registrant.

### `registerInboundBatchObserver`

Outer poll-loop observer after `getPendingMessages` (system messages filtered).

- Same sync / non-blocking / advisory 25ms budget contract as provider message
  observers.
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

- `src/warn-once.ts` / `container/agent-runner/src/warn-once.ts`
- `src/hosthooks.ts`
- `container/agent-runner/src/hosthooks.ts`
