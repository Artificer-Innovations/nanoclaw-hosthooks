import { TIMEZONE } from './config.js';
function args() {
  args.push('-e', `TZ=${TIMEZONE}`);
}
