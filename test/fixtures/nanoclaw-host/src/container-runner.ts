import { TIMEZONE } from './config.js';
function args(providerContribution: { env?: Record<string, string> } = {}) {
  args.push('-e', `TZ=${TIMEZONE}`);
  if (providerContribution.env) {
    for (const [key, value] of Object.entries(providerContribution.env)) {
      args.push('-e', `${key}=${value}`);
    }
  }
}
