import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadReplayFile, ReplayEngine, type ReplayEvent } from '../src/core/replay.js';

describe('replay', () => {
  it('loads replay events from ndjson', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lares4-console-replay-'));
    const file = join(dir, 'events.ndjson');
    await writeFile(file, `${JSON.stringify({
      atMs: 10,
      entry: { ts: new Date().toISOString(), level: 'info', tag: 'SYSTEM', message: 'hello' },
    })}\n`);
    const events = await loadReplayFile(file);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.atMs, 10);
  });

  it('steps through replay events deterministically', () => {
    const emitted: string[] = [];
    let finished = false;
    const engine = new ReplayEngine(
      (entry) => emitted.push(entry.message),
      () => { finished = true; },
    );
    const events: ReplayEvent[] = [
      { atMs: 0, entry: { ts: '2020-01-01T00:00:00.000Z', level: 'info', tag: 'SYSTEM', message: 'a' } },
      { atMs: 100, entry: { ts: '2020-01-01T00:00:00.100Z', level: 'info', tag: 'SYSTEM', message: 'b' } },
    ];
    engine.load(events);
    engine.step();
    engine.step();
    assert.deepEqual(emitted, ['a', 'b']);
    assert.equal(finished, true);
  });
});
