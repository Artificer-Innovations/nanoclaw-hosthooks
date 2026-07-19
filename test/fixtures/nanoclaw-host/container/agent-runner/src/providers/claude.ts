import { query } from 'sdk';
const options = {
        permissionMode: 'bypassPermissions',
};
async function* events() {
        messageCount++;

        // Yield activity for every SDK event so the poll loop knows the agent is working
        yield { type: 'activity' };
}
