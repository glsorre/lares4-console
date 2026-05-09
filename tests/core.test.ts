import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCompletion, suggestCompletions } from '../src/core/autocomplete.js';
import { executeCommand } from '../src/core/command-router.js';
import {
  buildRenderRows,
  formatLogClock,
  getLogViewport,
  getVisibleRenderRows,
  getVisibleRenderRowsFromFlat,
  maxTailScrollOffset,
} from '../src/core/log-view.js';
import { isControlInputToIgnore } from '../src/app/CommandTextInput.js';
import { sliceRenderedLine, wrapRenderedLine } from '../src/core/render.js';
import { DEFAULT_EVENT_FILTERS } from '../src/core/defaults.js';
import type { EventFilter, LogEntry } from '../src/core/types.js';
import { parseCommandTokens } from '../src/core/parsers.js';

describe('autocomplete', () => {
  it('suggests raw full values', () => {
    const suggestions = suggestCompletions('raw full o');
    assert.ok(suggestions.includes('on'));
    assert.ok(suggestions.includes('off'));
  });

  it('replaces active token for nested commands', () => {
    assert.equal(applyCompletion('events a', 'all'), 'events all ');
    assert.equal(applyCompletion('raw full o', 'off'), 'raw full off ');
    assert.equal(applyCompletion('covers to 1', '10'), 'covers to 10 ');
  });

  it('suggests state scopes', () => {
    const suggestions = suggestCompletions('state s');
    assert.ok(suggestions.includes('switches'));
    assert.ok(suggestions.includes('scenarios'));
    assert.ok(suggestions.includes('system'));
  });

  it('suggests only supported zone scope for state', () => {
    const suggestions = suggestCompletions('state zon');
    assert.ok(suggestions.includes('zones'));
    assert.ok(!suggestions.includes('zone'));
  });

  it('does not suggest deeper state tokens after scope', () => {
    const suggestions = suggestCompletions('state zones ');
    assert.deepEqual(suggestions, []);
  });
});

describe('render helpers', () => {
  it('wrap and slice work', () => {
    assert.deepEqual(wrapRenderedLine('abcdefghij123', 5), ['abcde', 'fghij', '123']);
    assert.equal(sliceRenderedLine('abcdefghij123', 4, 2), 'cdef');
  });

  it('builds viewport from offset with clamping', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      ts: new Date(1000 + i * 100).toISOString(),
      level: 'info' as const,
      tag: 'SYSTEM' as const,
      message: `m${String(i)}`,
    }));
    const tail = getLogViewport(entries, 0, 4);
    assert.equal(tail.start, 6);
    assert.equal(tail.visible.length, 4);
    assert.equal(tail.visible[0]?.message, 'm6');

    const scrolled = getLogViewport(entries, 2, 4);
    assert.equal(scrolled.start, 4);
    assert.equal(scrolled.visible[0]?.message, 'm4');

    const clamped = getLogViewport(entries, 99, 4);
    assert.equal(clamped.maxOffset, 6);
    assert.equal(clamped.start, 0);
  });

  it('adds subtle and strong separators by time gap', () => {
    const entries: LogEntry[] = [
      { ts: new Date(1000).toISOString(), level: 'info', tag: 'SYSTEM', message: 'a' },
      { ts: new Date(1200).toISOString(), level: 'info', tag: 'SYSTEM', message: 'b' },
      { ts: new Date(6000).toISOString(), level: 'info', tag: 'SYSTEM', message: 'c' },
    ];
    const rows = buildRenderRows(entries, 2000);
    assert.equal(rows.filter((r) => r.kind === 'separator').length, 2);
    assert.equal(rows[1]?.kind, 'separator');
    assert.equal(rows[1]?.strong, false);
    assert.match(rows[1]?.text ?? '', /^─── \[SYSTEM \d{2}:\d{2}:\d{2}\] ───$/);
    assert.equal(rows[3]?.kind, 'separator');
    assert.equal(rows[3]?.strong, true);
    assert.match(rows[3]?.text ?? '', /^━━━ \[SYSTEM \d{2}:\d{2}:\d{2}\] ━━━$/);
  });

  it('HR labels use the next block tag and clock (not repeated on entry lines)', () => {
    const t0 = new Date(1000).toISOString();
    const t1 = new Date(2500).toISOString();
    const entries: LogEntry[] = [
      { ts: t0, level: 'info', tag: 'SYSTEM', message: 'a' },
      { ts: t1, level: 'info', tag: 'RAW_RX', message: 'frame' },
    ];
    const rows = buildRenderRows(entries, 2000);
    assert.equal(rows[1]?.strong, false);
    assert.match(rows[1]?.text ?? '', /^─── \[RAW_RX \d{2}:\d{2}:\d{2}\] ───$/);
    assert.equal(rows[2]?.text, 'frame');
    assert.ok(!rows[2]?.text.includes(':'));
  });

  it('visible render rows clamp and slice using flattened render model', () => {
    const gid = 'one-block';
    const entries: LogEntry[] = Array.from({ length: 4 }, (_, i) => ({
      ts: new Date(5000 + i).toISOString(),
      level: 'info' as const,
      tag: 'SYSTEM' as const,
      message: `m${String(i)}`,
      groupId: gid,
    }));
    const tail = getVisibleRenderRows(entries, 0, 2, 2000);
    assert.equal(tail.totalRows, 4);
    assert.equal(tail.rows.length, 2);
    assert.equal(tail.rows[0]?.text, 'm2');
    assert.equal(tail.rows[1]?.text, 'm3');
    assert.equal(tail.maxOffset, 2);

    const mid = getVisibleRenderRows(entries, 1, 2, 2000);
    assert.equal(mid.rows[0]?.text, 'm1');
    assert.equal(mid.rows[1]?.text, 'm2');

    const top = getVisibleRenderRows(entries, 99, 2, 2000);
    assert.equal(top.maxOffset, 2);
    assert.equal(top.rows[0]?.text, 'm0');
    assert.equal(top.rows[1]?.text, 'm1');
  });

  it('visible rows from flat model support overscan and bounds', () => {
    const flat = Array.from({ length: 20 }, (_, i) => ({
      kind: 'entry' as const,
      id: `r-${String(i)}`,
      text: `r${String(i)}`,
    }));
    const model = getVisibleRenderRowsFromFlat(flat, 0, 5, 2);
    assert.equal(model.totalRows, 20);
    assert.equal(model.maxOffset, 15);
    assert.equal(model.start, 11);
    assert.equal(model.end, 20);
    assert.equal(model.rows[0]?.text, 'r11');
    assert.equal(model.rows.at(-1)?.text, 'r19');

    const top = getVisibleRenderRowsFromFlat(flat, 999, 5, 2);
    assert.equal(top.start, 0);
    assert.equal(top.rows[0]?.text, 'r0');
  });

  it('getVisibleRenderRows accepts overscan and keeps row count coherent', () => {
    const entries: LogEntry[] = Array.from({ length: 12 }, (_, i) => ({
      ts: new Date(1000 + i).toISOString(),
      level: 'info',
      tag: 'SYSTEM',
      message: `m${String(i)}`,
    }));
    const noOverscan = getVisibleRenderRows(entries, 0, 4, 2000, 0);
    const withOverscan = getVisibleRenderRows(entries, 0, 4, 2000, 2);
    assert.equal(noOverscan.totalRows, withOverscan.totalRows);
    assert.equal(noOverscan.maxOffset, withOverscan.maxOffset);
    assert.ok(withOverscan.rows.length >= noOverscan.rows.length);
  });

  it('renders entry rows without origin prefix', () => {
    const entries: LogEntry[] = [
      { ts: new Date(1000).toISOString(), level: 'info', tag: 'SYSTEM', message: 'hello', groupId: 'g1' },
      { ts: new Date(1200).toISOString(), level: 'debug', tag: 'RAW_RX', message: '{"x":1}', groupId: 'g2' },
    ];
    const rows = buildRenderRows(entries, 2000);
    const entryRows = rows.filter((row) => row.kind === 'entry');
    assert.equal(entryRows[0]?.text, 'hello');
    assert.equal(entryRows[1]?.text, '{"x":1}');
  });

  it('formatLogClock falls back for invalid timestamps', () => {
    assert.equal(formatLogClock('not-a-date'), '--:--:--');
  });

  it('does not render separators within same group block', () => {
    const entries: LogEntry[] = [
      { ts: new Date(1000).toISOString(), level: 'info', tag: 'SYSTEM', message: '{', groupId: 'g1' },
      { ts: new Date(1001).toISOString(), level: 'info', tag: 'SYSTEM', message: '"x": 1', groupId: 'g1' },
      { ts: new Date(1002).toISOString(), level: 'info', tag: 'SYSTEM', message: '}', groupId: 'g1' },
      { ts: new Date(6000).toISOString(), level: 'warn', tag: 'SYSTEM', message: 'summary', groupId: 'g2' },
    ];
    const rows = buildRenderRows(entries, 2000);
    assert.equal(rows.filter((r) => r.kind === 'separator').length, 1);
    assert.equal(rows[3]?.kind, 'separator');
  });

  it('separator uses fallback clock when the next block timestamp is invalid', () => {
    const entries: LogEntry[] = [
      { ts: new Date(1000).toISOString(), level: 'info', tag: 'SYSTEM', message: 'a', groupId: 'g1' },
      { ts: 'not-a-date', level: 'info', tag: 'SYSTEM', message: 'b', groupId: 'g2' },
    ];
    const rows = buildRenderRows(entries, 2000);
    assert.match(rows[1]?.text ?? '', /^─── \[SYSTEM --:--:--\] ───$/);
  });

  it('falls back to subtle separator when timestamp is invalid (HR still uses next block clock)', () => {
    const entries: LogEntry[] = [
      { ts: 'not-a-date', level: 'info', tag: 'SYSTEM', message: 'a', groupId: 'g1' },
      { ts: new Date(6000).toISOString(), level: 'info', tag: 'SYSTEM', message: 'b', groupId: 'g2' },
    ];
    const rows = buildRenderRows(entries, 2000);
    assert.equal(rows.filter((r) => r.kind === 'separator').length, 1);
    assert.equal(rows[1]?.strong, false);
    assert.match(rows[1]?.text ?? '', /^─── \[SYSTEM \d{2}:\d{2}:\d{2}\] ───$/);
  });
});

describe('input filtering', () => {
  it('ignores page and wheel control input in command field', () => {
    assert.equal(isControlInputToIgnore('\u001B[5~', { pageUp: false, pageDown: false }), true);
    assert.equal(isControlInputToIgnore('\u001B[6~', { pageUp: false, pageDown: false }), true);
    assert.equal(isControlInputToIgnore('\u001B[<64;80;20M', { pageUp: false, pageDown: false }), true);
    assert.equal(isControlInputToIgnore('\u001B[<65;80;20M', { pageUp: false, pageDown: false }), true);
    assert.equal(isControlInputToIgnore('abc', { pageUp: false, pageDown: false }), false);
  });
});

describe('command router', () => {
  const baseCtx = {
    lares: {
      switchOn: () => undefined,
      switchOff: () => undefined,
      dimmerTo: () => undefined,
      rollUp: () => undefined,
      rollDown: () => undefined,
      rollStop: () => undefined,
      rollTo: () => undefined,
      triggerScenario: () => undefined,
    },
    socketSend: () => undefined,
    outputFormat: 'pretty' as const,
    eventFilters: new Set<EventFilter>(['all']),
    onEventFiltersChanged: () => undefined,
    onFormatChanged: () => undefined,
    rawFullEnabled: false,
    onRawFullChanged: () => undefined,
    onExport: async () => 'x.log',
    getStateSnapshot: (scope: string) => ({ scope }),
  };

  it('toggles raw full mode', async () => {
    let changed = false;
    const lines = await executeCommand('raw full on', {
      ...baseCtx,
      onRawFullChanged: () => { changed = true; },
    });
    assert.ok(changed);
    assert.ok(lines[0].includes('on'));
  });

  it('supports raw sendcmd', async () => {
    let sent: unknown[] = [];
    const lines = await executeCommand('raw sendcmd {"CMD":"X","PAYLOAD_TYPE":"Y","PAYLOAD":{"a":1}}', {
      ...baseCtx,
      socketSend: (cmd, payloadType, payload) => {
        sent = [cmd, payloadType, payload];
      },
    });
    assert.deepEqual(sent, ['X', 'Y', { a: 1 }]);
    assert.ok(lines[0].includes('raw sendcmd X Y'));
  });

  it('supports state command with scope', async () => {
    const lines = await executeCommand('state lights', baseCtx);
    assert.ok(lines[0].includes('"scope": "lights"'));
  });

  it('supports state zones', async () => {
    const lines = await executeCommand('state zones', baseCtx);
    assert.ok(lines[0].includes('"scope": "zones"'));
  });

  it('prints explicit message when state scope has no data', async () => {
    const lines = await executeCommand('state zones', {
      ...baseCtx,
      getStateSnapshot: () => undefined,
    });
    assert.equal(lines[0], 'No data available for state scope: zones');
  });

  it('reports events filter changes', async () => {
    let next = '';
    const lines = await executeCommand('events acks,raw', {
      ...baseCtx,
      onEventFiltersChanged: (filters) => {
        next = Array.from(filters).join(',');
      },
    });
    assert.equal(next, 'acks,raw');
    assert.ok(lines[0].includes('acks,raw'));
  });

  it('throws explicit unsupported error for unknown command', async () => {
    await assert.rejects(
      () => executeCommand('badcmd', baseCtx),
      /Unsupported command usage for "badcmd"\. Usage: help\./,
    );
  });

  it('throws explicit unsupported error for invalid state scope', async () => {
    await assert.rejects(
      () => executeCommand('state zone', baseCtx),
      (error: unknown) =>
        error instanceof Error
        && error.message.includes('Unsupported command usage for "state". Usage: state ')
        && error.message.includes('thermostats|zones|scenarios|system|outputs'),
    );
  });

  it('throws explicit unsupported error for invalid events filter', async () => {
    await assert.rejects(
      () => executeCommand('events all,invalid', baseCtx),
      /Unsupported command usage for "events"\. Usage: events none\|all\|acks,errors,multitypes,raw,changes\./,
    );
  });

  it('returns sentinel on quit command', async () => {
    const lines = await executeCommand('quit', baseCtx);
    assert.equal(lines[0], '__EXIT__');
  });

  it('supports quoted tokens in command line parser', () => {
    assert.deepEqual(parseCommandTokens(`raw send A B '{"hello": "world"}'`), [
      'raw',
      'send',
      'A',
      'B',
      '{"hello": "world"}',
    ]);
  });
});

describe('scroll tail offset', () => {
  it('maxTailScrollOffset matches clamp range for typical sizes', () => {
    assert.equal(maxTailScrollOffset(100, 20), 80);
    assert.equal(maxTailScrollOffset(5, 20), 0);
    assert.equal(maxTailScrollOffset(21, 20), 1);
  });
});

describe('defaults', () => {
  it('uses events all by default', () => {
    assert.ok(DEFAULT_EVENT_FILTERS.has('all'));
    assert.equal(DEFAULT_EVENT_FILTERS.size, 1);
  });
});
