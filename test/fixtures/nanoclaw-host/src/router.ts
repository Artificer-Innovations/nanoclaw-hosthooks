import { log } from './log.js';

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
