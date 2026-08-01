import { getPendingMessages } from './db.js';
async function poll() {
    const messages = getPendingMessages(isFirstPoll).filter((m) => m.kind !== 'system');
    const query = config.provider.query({
      prompt,
      continuation,
    });
}
async function processQuery(providerName: string) {
      if (event.type === 'init') {
        queryContinuation = event.continuation;
      }
}
