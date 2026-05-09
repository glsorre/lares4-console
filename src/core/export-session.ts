import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { LogEntry, OutputFormat } from './types.js';
import { redactSecrets } from './utils.js';

export interface ExportMeta {
  sender: string;
  format: OutputFormat;
  events: string;
  startedAt: string;
}

export async function exportSession(
  logs: LogEntry[],
  meta: ExportMeta,
  explicitPath?: string,
): Promise<string> {
  const filePath = explicitPath !== undefined
    ? resolve(explicitPath)
    : join(resolve('.sessions'), `session-${Date.now()}.log`);
  await mkdir(dirname(filePath), { recursive: true });
  const lines = [
    '# lares4-debug-console session',
    `started_at=${meta.startedAt}`,
    `sender=${meta.sender}`,
    `format=${meta.format}`,
    `events=${meta.events}`,
    '',
    ...logs.map((log) => `[${log.ts}] [${log.tag}] [${log.level}] ${log.message}`),
  ];
  await writeFile(filePath, redactSecrets(`${lines.join('\n')}\n`), 'utf8');
  return filePath;
}
