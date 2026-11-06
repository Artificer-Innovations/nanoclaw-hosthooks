import { query as sdkQuery } from 'sdk';
function query(input: { continuation?: string }) {
    const sdkResult = sdkQuery({
        permissionMode: this.executionPolicy.permissionMode,
    });
}
async function* events() {
        messageCount++;
        yield { type: 'activity' };
}
