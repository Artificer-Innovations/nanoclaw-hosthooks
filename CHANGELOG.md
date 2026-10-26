# nanoclaw-hosthooks

## 0.2.1

### Patch Changes

- Publish await evaluateEngage install patches required for NanoClaw 2026.10.1-rc.2.

## 0.2.0

### Minor Changes

- Add `registerProviderQueryStartObserver` / `runProviderQueryStartObservers`
  with stages `provider_query`, `sdk_query`, and `session_init`.
- Patch poll-loop (query start + ProviderEvent init), Claude (`sdkQuery`),
  Codex, and OpenCode harness boot sites. Capability flag
  `features.providerQueryStart: true` (API version remains 1).

## 0.1.0

### Minor Changes

- Add hosthooks API version 1 with the six extension points required by
  nanoclaw-webchat and nanoclaw-agenttrace.
- Add transactional install, upgrade, verify, and uninstall commands.
