export const fixtureSources = {
  router: `import { log } from './log.js';

function route() {
    const engages = evaluateEngage(agent, messageText, isMention, mg, effectiveThreadId);
    const accessOk = engages;
    const scopeOk = engages;
    if (engages && accessOk && scopeOk) {
      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, true);
    } else if (agent.ignored_message_policy === 'accumulate' && !(engages && (!accessOk || !scopeOk))) {
      // Stock NanoClaw accumulate security predicate — do not simplify in fixtures.
      // Citation: upstream/main d23db4f3 src/router.ts:362
      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, false);
    }
}

async function deliverToAgent(
  wake: boolean,
): Promise<void> {
  if (event.message.kind === 'chat' || event.message.kind === 'chat-sdk') {
  }
}
`,
  delivery: `import { log } from './log.js';
async function deliver() {
  const platformMsgId = await deliveryAdapter.deliver(
    msg.channel_type,
    msg.platform_id,
    msg.thread_id,
    msg.kind,
    msg.content,
    files,
    deliverInstance,
  );
}
`,
  claude: `import { query as sdkQuery } from 'sdk';
function query(input: { continuation?: string }) {
    const sdkResult = sdkQuery({
        permissionMode: 'bypassPermissions',
    });
}
async function* events() {
        messageCount++;

        // Yield activity for every SDK event so the poll loop knows the agent is working
        yield { type: 'activity' };
}
`,
  poll: `import { getPendingMessages } from './db.js';
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
`,
  codex: `import type { ProviderEvent } from './types.js';
class CodexProvider {
  query(input: { continuation?: string }) {
    async function* gen(): AsyncGenerator<ProviderEvent> {
      const server = self.runtime.spawnCodexAppServer();
    }
  }
}
`,
  opencode: `import type { ProviderEvent } from './types.js';
class OpenCodeProvider {
  query(input: { continuation?: string }) {
    async function* gen(): AsyncGenerator<ProviderEvent> {
      const rt = await ensureSharedRuntime(self.options);
    }
  }
}
`,
  container: `import { TIMEZONE } from './config.js';
function args(providerContribution: { env?: Record<string, string> } = {}) {
  args.push('-e', \`TZ=\${TIMEZONE}\`);
  if (providerContribution.env) {
    for (const [key, value] of Object.entries(providerContribution.env)) {
      args.push('-e', \`\${key}=\${value}\`);
    }
  }
}
`,
};
