# nanoclaw-hosthooks

Composable, append-only extension points for NanoClaw skills.

Hosthooks supplies stable seams for `nanoclaw-webchat` and
`nanoclaw-agenttrace` without embedding either product's business logic in the
NanoClaw host. API version 1 installs the complete surface both products use.

## Install

```bash
pnpm add nanoclaw-hosthooks
pnpm exec nanoclaw-hosthooks install
pnpm install
pnpm run build
./container/build.sh
pnpm exec nanoclaw-hosthooks verify
```

The installer is surgical and transactional: it validates and computes every
source transform first, uses atomic file replacement, and rolls back if a
commit fails. Upgrades are idempotent.

## API version 1

Host registry (`src/hosthooks.ts`):

- `registerDeliveryPolicy`
- `registerOutboundContentTransform`
- `registerContainerEnvContributor`

Runner registry (`container/agent-runner/src/hosthooks.ts`):

- `registerProviderMessageObserver`
- `registerProviderQueryOptionsContributor`
- `registerInboundBatchObserver`

Every registration is named and returns an unregister function. Registries
append in registration order. Delivery engagement is opt-in only; access and
sender-scope gates remain authoritative. Container environment key collisions
throw instead of silently overwriting another skill.

Observers are synchronous hot-path callbacks with a 25ms budget. Errors are
isolated and slow or Promise-returning observers warn once. JavaScript cannot
preempt a synchronous callback, so the budget is diagnostic; consumers must
not perform blocking I/O in observers.

See [QUICKSTART.md](QUICKSTART.md), [api-contract.md](api-contract.md), and the
bundled `add-hosthooks` skill.
