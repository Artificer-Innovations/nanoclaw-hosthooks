import { TIMEZONE } from './config.js';
function args(
  containerConfig: { timezone?: string } = {},
  providerContribution: { env?: Record<string, string> } = {},
) {
  args.push('-e', `TZ=${containerConfig.timezone ?? TIMEZONE}`);
  if (providerContribution.env) {
    for (const [key, value] of Object.entries(providerContribution.env)) {
      args.push('-e', `${key}=${value}`);
    }
  }
}
