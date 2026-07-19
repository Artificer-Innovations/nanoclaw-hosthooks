# Quickstart

From a NanoClaw checkout:

```bash
pnpm add nanoclaw-hosthooks
pnpm exec nanoclaw-hosthooks install
pnpm run build
./container/build.sh
pnpm exec nanoclaw-hosthooks verify
```

Then install or upgrade `nanoclaw-webchat` and `nanoclaw-agenttrace` versions
that register against hosthooks API version 1, and restart the host.

Run `pnpm exec nanoclaw-hosthooks upgrade` after upgrading NanoClaw. A missing
or ambiguous source anchor aborts before any host file is changed.
