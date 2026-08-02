#!/usr/bin/env node
/**
 * Build a minimal NanoClaw host skeleton for CLI integration tests.
 * Anchors match stock upstream call sites, including the accumulate security
 * predicate (upstream/main d23db4f3 src/router.ts:362).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'test/fixtures/nanoclaw-host');

function write(relativePath, content) {
  const target = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(fixtureRoot, { recursive: true });

write(
  'package.json',
  `${JSON.stringify(
    {
      name: 'nanoclaw-host-fixture',
      private: true,
      type: 'module',
      scripts: { build: 'echo ok' },
    },
    null,
    2,
  )}\n`,
);

write('src/channels/index.ts', 'export {};\n');
write(
  'src/index.ts',
  `async function main() {
  await startCliServer();
  await initChannelAdapters(() => ({}));
}

declare function startCliServer(): Promise<void>;
declare function initChannelAdapters(factory: unknown): Promise<void>;

void main();
`,
);

write(
  'src/router.ts',
  `import { log } from './log.js';

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
);

write(
  'src/delivery.ts',
  `import { log } from './log.js';
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
);

write(
  'src/container-runner.ts',
  `import { TIMEZONE } from './config.js';
function args(
  containerConfig: { timezone?: string } = {},
  providerContribution: { env?: Record<string, string> } = {},
) {
  args.push('-e', \`TZ=\${containerConfig.timezone ?? TIMEZONE}\`);
  if (providerContribution.env) {
    for (const [key, value] of Object.entries(providerContribution.env)) {
      args.push('-e', \`\${key}=\${value}\`);
    }
  }
}
`,
);

write(
  'container/agent-runner/src/providers/claude.ts',
  `import { query as sdkQuery } from 'sdk';
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
);

write(
  'container/agent-runner/src/poll-loop.ts',
  `import { getPendingMessages } from './db.js';
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
);

console.log(`Wrote fixture → ${path.relative(root, fixtureRoot)}`);
