import type { GenericLogger } from 'lares4-ts';
import { redactSecrets } from '../core/utils.js';

/** Default GenericLogger adapter wired into the lares4-ts client. Routes every level
 *  to the matching console method so panel chatter shows up in DevTools without a
 *  dedicated transport. Each message is passed through `redactSecrets` so PINs that
 *  may appear inside stringified error frames (`Login failed: …`, `Failed to parse
 *  event payload: …`, etc.) never reach the console. Replace via dependency injection
 *  if you need a structured sink. */
const redact = (msg: unknown): string =>
  redactSecrets(typeof msg === 'string' ? msg : String(msg));

export const defaultLogger: GenericLogger = {
  info: (msg) => console.info(redact(msg)),
  error: (msg) => console.error(redact(msg)),
  warn: (msg) => console.warn(redact(msg)),
  debug: (msg) => console.debug(redact(msg)),
};
