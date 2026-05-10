import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { exportSession } from '../src/core/export-session.js';
import type { LogEntry } from '../src/core/types.js';

describe('exportSession', () => {
  it('writes header metadata and log lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lares4-export-'));
    const target = join(dir, 'out.log');
    const logs: LogEntry[] = [
      {
        ts: '2020-01-01T12:00:00.000Z',
        level: 'info',
        tag: 'SYSTEM',
        message: 'hello',
      },
    ];
    const path = await exportSession(logs, {
      sender: 'test-sender',
      format: 'pretty',
      events: 'all',
      startedAt: '2020-01-01T11:00:00.000Z',
    }, target);

    assert.equal(path, target);
    const raw = await readFile(target, 'utf8');
    assert.match(raw, /^# lares4-debug-console session\n/);
    assert.match(raw, /^started_at=2020-01-01T11:00:00\.000Z$/m);
    assert.match(raw, /^sender=test-sender$/m);
    assert.match(raw, /^format=pretty$/m);
    assert.match(raw, /^events=all$/m);
    assert.match(raw, /\[2020-01-01T12:00:00\.000Z\] \[SYSTEM\] \[info\] hello\n/);
  });
});
