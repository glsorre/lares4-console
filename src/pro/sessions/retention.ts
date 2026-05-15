// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import type { SessionsAdapter } from './db.js';

export const RETENTION_DAYS = 30;

export function cutoffIso(now: number, days: number = RETENTION_DAYS): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function purgeStale(
  adapter: SessionsAdapter,
  now: number = Date.now(),
  days: number = RETENTION_DAYS,
): Promise<void> {
  await adapter.purgeOlderThan(cutoffIso(now, days));
}
