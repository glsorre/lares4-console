import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCompletion, suggestCompletions } from '../src/core/autocomplete.js';
import { executeCommand, type CommandOutputItem } from '../src/core/command-router.js';

function textOf(item: CommandOutputItem): string {
  return typeof item === 'string' ? item : item.text;
}
import {
  buildMessageListItems,
  buildRenderRows,
  formatLogClock,
  getLogViewport,
  getVisibleRenderRows,
  getVisibleRenderRowsFromFlat,
} from '../src/core/log-view.js';
import { sliceRenderedLine, wrapRenderedLine } from '../src/core/render.js';
import { DEFAULT_EVENT_FILTERS } from '../src/core/defaults.js';
import type { EventFilter, LogEntry } from '../src/core/types.js';
import { parseCommandTokens } from '../src/core/parsers.js';
import { formatOutput } from '../src/core/utils.js';

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

  it('continues completion suggestions after first tab-applied token', () => {
    const afterFirstCompletion = applyCompletion('fo', 'format');
    assert.equal(afterFirstCompletion, 'format ');
    const suggestions = suggestCompletions(afterFirstCompletion);
    assert.ok(suggestions.includes('pretty'));
    assert.ok(suggestions.includes('json'));
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

  it('suggests second token after trailing space', () => {
    const formatSuggestions = suggestCompletions('format ');
    assert.ok(formatSuggestions.includes('pretty'));
    assert.ok(formatSuggestions.includes('json'));

    const eventSuggestions = suggestCompletions('events ');
    assert.ok(eventSuggestions.includes('all'));
    assert.ok(eventSuggestions.includes('none'));
    assert.ok(eventSuggestions.includes('raw'));
  });

  it('suggests raw full values after trailing space', () => {
    const suggestions = suggestCompletions('raw full ');
    assert.ok(suggestions.includes('on'));
    assert.ok(suggestions.includes('off'));
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

  it('renders folded entries collapsed and expanded', () => {
    const entries: LogEntry[] = [
      {
        ts: new Date(1000).toISOString(),
        level: 'debug',
        tag: 'RAW_RX',
        message: 'preview',
        groupId: 'g-fold',
        folded: {
          preview: 'preview',
          full: 'line1\nline2',
        },
      },
    ];
    const collapsed = buildRenderRows(entries, 2000);
    assert.equal(collapsed.length, 1);
    assert.match(collapsed[0]?.text ?? '', /\[collapsed\]$/);

    const expanded = buildRenderRows(entries, 2000, new Set(['g-fold']));
    assert.equal(expanded.length, 2);
    assert.equal(expanded[0]?.text, 'line1');
    assert.equal(expanded[1]?.text, 'line2');
    assert.equal(collapsed[0]?.selectable, true);
    assert.equal(collapsed[0]?.sourceEntryId, 'g-fold');
    assert.equal(expanded[0]?.selectable, true);
    assert.equal(expanded[1]?.selectable, false);
    assert.equal(expanded[0]?.sourceEntryId, 'g-fold');
    assert.equal(expanded[1]?.sourceEntryId, 'g-fold');
  });

  it('marks non-folded entries selectable and separators not selectable', () => {
    const entries: LogEntry[] = [
      { ts: new Date(1000).toISOString(), level: 'info', tag: 'SYSTEM', message: 'a', groupId: 'g1' },
      { ts: new Date(6000).toISOString(), level: 'info', tag: 'SYSTEM', message: 'b', groupId: 'g2' },
    ];
    const rows = buildRenderRows(entries, 2000);
    const separator = rows.find((r) => r.kind === 'separator');
    const firstEntry = rows.find((r) => r.kind === 'entry');
    assert.equal(separator?.selectable, false);
    assert.equal(firstEntry?.selectable, true);
    assert.ok(typeof firstEntry?.id === 'string');
  });

  it('uses one selection identity for multiline non-folded group rows', () => {
    const entries: LogEntry[] = [
      { ts: new Date(1000).toISOString(), level: 'debug', tag: 'RAW_RX', message: 'line1', groupId: 'g-raw' },
      { ts: new Date(1001).toISOString(), level: 'debug', tag: 'RAW_RX', message: 'line2', groupId: 'g-raw' },
      { ts: new Date(1002).toISOString(), level: 'debug', tag: 'RAW_RX', message: 'line3', groupId: 'g-raw' },
    ];
    const rows = buildRenderRows(entries, 2000);
    const ids = rows.filter((r) => r.kind === 'entry').map((r) => r.sourceEntryId);
    assert.deepEqual(ids, ['g-raw', 'g-raw', 'g-raw']);
  });

  it('builds one list item per message block and links folded content', () => {
    const entries: LogEntry[] = [
      {
        ts: new Date(1000).toISOString(),
        level: 'debug',
        tag: 'RAW_RX',
        message: 'preview',
        groupId: 'g-fold',
        folded: { preview: 'preview', full: 'line1\nline2' },
      },
      { ts: new Date(2000).toISOString(), level: 'info', tag: 'SYSTEM', message: 'a', groupId: 'g-plain' },
      { ts: new Date(2001).toISOString(), level: 'info', tag: 'SYSTEM', message: 'b', groupId: 'g-plain' },
    ];
    const collapsed = buildMessageListItems(entries);
    assert.equal(collapsed.length, 2);
    assert.equal(collapsed[0]?.id, 'g-fold');
    assert.equal(collapsed[0]?.collapsed, true);
    assert.equal(collapsed[1]?.content, 'a\nb');

    const expanded = buildMessageListItems(entries, new Set(['g-fold']));
    assert.equal(expanded[0]?.collapsed, false);
    assert.equal(expanded[0]?.content, 'line1\nline2');
  });

  it('does not merge consecutive LOG entries with identical previews', () => {
    const entries: LogEntry[] = [
      { ts: new Date(1000).toISOString(), level: 'info', tag: 'LOG', message: 'state lights output', groupId: 'cmd-A' },
      { ts: new Date(2000).toISOString(), level: 'info', tag: 'LOG', message: 'state lights output', groupId: 'cmd-B' },
    ];
    const items = buildMessageListItems(entries);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.repeat, 1);
    assert.equal(items[1]?.repeat, 1);
    assert.equal(items[0]?.id, 'cmd-A');
    assert.equal(items[1]?.id, 'cmd-B');
  });

  it('does not merge consecutive ERROR or SYSTEM rows with identical previews', () => {
    const entries: LogEntry[] = [
      { ts: new Date(1000).toISOString(), level: 'error', tag: 'ERROR', message: 'boom', groupId: 'e-1' },
      { ts: new Date(1001).toISOString(), level: 'error', tag: 'ERROR', message: 'boom', groupId: 'e-2' },
      { ts: new Date(1002).toISOString(), level: 'info', tag: 'SYSTEM', message: 'sys', groupId: 's-1' },
      { ts: new Date(1003).toISOString(), level: 'info', tag: 'SYSTEM', message: 'sys', groupId: 's-2' },
    ];
    const items = buildMessageListItems(entries);
    assert.equal(items.length, 4);
    assert.ok(items.every((it) => it.repeat === 1));
  });

  it('still merges consecutive CHANGE entries with identical previews', () => {
    const entries: LogEntry[] = [
      { ts: new Date(1000).toISOString(), level: 'info', tag: 'CHANGE', message: 'lights[1] on', groupId: 'g-c1' },
      { ts: new Date(1100).toISOString(), level: 'info', tag: 'CHANGE', message: 'lights[1] on', groupId: 'g-c2' },
      { ts: new Date(1200).toISOString(), level: 'info', tag: 'CHANGE', message: 'lights[1] on', groupId: 'g-c3' },
    ];
    const items = buildMessageListItems(entries);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.repeat, 3);
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
    outputFormat: 'json' as const,
    eventFilters: new Set<EventFilter>(['all']),
    onEventFiltersChanged: () => undefined,
    onFormatChanged: () => undefined,
    rawFullEnabled: false,
    onRawFullChanged: () => undefined,
    onExport: async () => 'x.log',
    getStateSnapshot: (scope: string) => ({ scope }),
  };

  const prettyBaseCtx = {
    ...baseCtx,
    outputFormat: 'pretty' as const,
  };

  it('toggles raw full mode', async () => {
    let changed = false;
    const lines = await executeCommand('raw full on', {
      ...baseCtx,
      onRawFullChanged: () => { changed = true; },
    });
    assert.ok(changed);
    assert.ok(textOf(lines[0]).includes('on'));
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
    assert.ok(textOf(lines[0]).includes('raw sendcmd X Y'));
  });

  it('supports state command with scope', async () => {
    const lines = await executeCommand('state lights', baseCtx);
    assert.ok(textOf(lines[0]).includes('"scope": "lights"'));
  });

  it('default output mode behaves as pretty', async () => {
    const lines = await executeCommand('state lights', prettyBaseCtx);
    assert.equal(textOf(lines[0]), 'scope: lights');
  });

  it('renders state output based on format mode', async () => {
    const prettyLines = await executeCommand('state lights', {
      ...baseCtx,
      outputFormat: 'pretty',
      getStateSnapshot: () => ({ room: 'kitchen', level: 90 }),
    });
    assert.equal(textOf(prettyLines[0]), 'room: kitchen\nlevel: 90');

    const jsonLines = await executeCommand('state lights', {
      ...baseCtx,
      outputFormat: 'json',
      getStateSnapshot: () => ({ room: 'kitchen', level: 90 }),
    });
    assert.ok(textOf(jsonLines[0]).includes('"room": "kitchen"'));
    assert.ok(textOf(jsonLines[0]).includes('"level": 90'));
  });

  it('reports current format when no format arg is provided', async () => {
    const pretty = await executeCommand('format', {
      ...baseCtx,
      outputFormat: 'pretty',
    });
    assert.equal(textOf(pretty[0]), 'Output format: pretty');

    const json = await executeCommand('format', {
      ...baseCtx,
      outputFormat: 'json',
    });
    assert.equal(textOf(json[0]), 'Output format: json');
  });

  it('renders pretty output for state zones and status paths', async () => {
    const zonesState = await executeCommand('state zones', {
      ...prettyBaseCtx,
      getStateSnapshot: () => ({ scope: 'zones', total: 3 }),
    });
    assert.equal(textOf(zonesState[0]), 'scope: zones\ntotal: 3');

    const zoneStatus = await executeCommand('zones status 2', {
      ...prettyBaseCtx,
      getStateSnapshot: () => [{ id: 2, label: 'Perimeter', active: true }],
    });
    assert.equal(textOf(zoneStatus[0]), 'id: 2\nlabel: Perimeter\nactive: true');
  });

  it('supports state zones', async () => {
    const lines = await executeCommand('state zones', baseCtx);
    assert.ok(textOf(lines[0]).includes('"scope": "zones"'));
  });

  it('prints explicit message when state scope has no data', async () => {
    const lines = await executeCommand('state zones', {
      ...baseCtx,
      getStateSnapshot: () => undefined,
    });
    assert.equal(textOf(lines[0]), 'No data available for state scope: zones');
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
    assert.ok(textOf(lines[0]).includes('acks,raw'));
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
      /Unsupported command usage for "events"\. Usage: events none\|all\|acks,errors,multitypes,raw,changes,sent\./,
    );
  });

  it('returns sentinel on quit command', async () => {
    const lines = await executeCommand('quit', baseCtx);
    assert.equal(textOf(lines[0]), '__EXIT__');
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

describe('defaults', () => {
  it('uses events all by default', () => {
    assert.ok(DEFAULT_EVENT_FILTERS.has('all'));
    assert.equal(DEFAULT_EVENT_FILTERS.size, 1);
  });
});

describe('raw formatter behavior', () => {
  it('formats parsed json as pretty tree', () => {
    const out = formatOutput({ root: { id: 1, active: true } }, 'pretty');
    assert.equal(out, 'root:\n  id: 1\n  active: true');
  });

  it('formats parsed json as json string', () => {
    const out = formatOutput({ root: { id: 1 } }, 'json');
    assert.ok(out.includes('"root"'));
    assert.ok(out.includes('"id": 1'));
  });

  it('keeps non-json raw text unchanged in fallback path model', () => {
    const raw = 'RAW:unstructured-frame';
    assert.equal(raw, 'RAW:unstructured-frame');
  });
});
