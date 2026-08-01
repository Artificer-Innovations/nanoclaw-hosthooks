import type { ProviderEvent } from './types.js';
class OpenCodeProvider {
  query(input: { continuation?: string }) {
    async function* gen(): AsyncGenerator<ProviderEvent> {
      const rt = await ensureSharedRuntime(self.options);
    }
  }
}
