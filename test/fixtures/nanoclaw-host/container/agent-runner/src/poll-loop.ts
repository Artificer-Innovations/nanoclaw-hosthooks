import { getPendingMessages } from './db.js';
async function poll() {
    const messages = getPendingMessages(isFirstPoll).filter((m) => m.kind !== 'system');
}
