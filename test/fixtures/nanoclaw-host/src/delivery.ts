import { log } from './log.js';
async function deliver() {
  const deliveredContent =
    content.type === 'ask_question' ? JSON.stringify({ ...content, fromAgent: true }) : msg.content;
  const platformMsgId = await deliveryAdapter.deliver(
    msg.channel_type,
    msg.platform_id,
    msg.thread_id,
    msg.kind,
    deliveredContent,
    files,
    deliverInstance,
  );
}
