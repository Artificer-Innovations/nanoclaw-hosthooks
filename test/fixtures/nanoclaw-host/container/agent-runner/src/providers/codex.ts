import type { ProviderEvent } from './types.js';
class CodexProvider {
  query(input: { continuation?: string }) {
    async function* gen(): AsyncGenerator<ProviderEvent> {
      const server = self.runtime.spawnCodexAppServer();
    }
  }
}
