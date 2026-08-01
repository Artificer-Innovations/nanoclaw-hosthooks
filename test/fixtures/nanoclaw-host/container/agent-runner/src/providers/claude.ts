import { query as sdkQuery } from 'sdk';
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
