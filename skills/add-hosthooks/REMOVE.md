# Remove NanoClaw hosthooks

First uninstall or disable every skill that imports `hosthooks.js`.

```bash
pnpm exec nanoclaw-hosthooks uninstall
pnpm remove nanoclaw-hosthooks
pnpm run build
./container/build.sh
```

Restart the NanoClaw host afterward. Uninstall restores only blocks owned by
`@nanoclaw-hosthooks` markers and removes the two copied registry modules.
