---
name: add-hosthooks
description: Install composable host extension hooks used by NanoClaw skills.
---

# Add NanoClaw hosthooks

Install the package in the NanoClaw repository:

```bash
pnpm add nanoclaw-hosthooks
pnpm exec nanoclaw-hosthooks install
pnpm install
pnpm run build
./container/build.sh
pnpm exec nanoclaw-hosthooks verify
```

The installer adds generic, append-only extension points:

- delivery policy
- outbound content transform
- provider message observer
- provider query options contributor
- inbound batch observer
- provider query-start observer (`provider_query` / `sdk_query` / `session_init`)
- container environment contributor

It computes all source transforms before writing, commits each file by
atomic rename, and rolls back committed files if a write fails. Re-running
`install` or `upgrade` is idempotent.

Hosthooks does not enable product behavior on its own. Install or upgrade the
skills that register these hooks, then restart the NanoClaw host. Rebuild the
container image whenever runner hooks or their consumers change.

Use `pnpm exec nanoclaw-hosthooks verify` after NanoClaw upgrades. If anchors
changed, the installer fails without partially patching the host.

See `REMOVE.md` before uninstalling; webchat and agenttrace may depend on these
capabilities.
