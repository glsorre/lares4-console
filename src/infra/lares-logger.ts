import type { GenericLogger } from 'lares4-ts';

/** Default GenericLogger adapter wired into the lares4-ts client. Routes every level
 *  to the matching console method so panel chatter shows up in DevTools without a
 *  dedicated transport. Replace via dependency injection if you need a structured sink. */
export const defaultLogger: GenericLogger = {
  info: (msg) => console.info(msg),
  error: (msg) => console.error(msg),
  warn: (msg) => console.warn(msg),
  debug: (msg) => console.debug(msg),
};
