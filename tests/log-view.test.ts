import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMessageListItems,
  buildRenderRows,
  extractChangeChildren,
  formatLogClock,
  getLogViewport,
  getVisibleRenderRows,
  getVisibleRenderRowsFromFlat,
  summarizeForPreview,
  topKeyAndId,
} from '../src/core/log-view.js';
import type { LogEntry } from '../src/core/types.js';

function entry(overrides: Partial<LogEntry> & { tag: LogEntry['tag']; ts: string }): LogEntry {
  return {
    level: 'info',
    message: '',
    ...overrides,
  };
}

describe('topKeyAndId', () => {
  it('returns the first object-valued key with ID/STA detail', () => {
    const out = topKeyAndId({ LIGHTS: [{ ID: '1', STA: 'ON' }] });
    assert.deepEqual(out, { key: 'LIGHTS', idPart: '[1] ON', id: '1' });
  });

  it('falls back to just the ID when STA is missing', () => {
    assert.deepEqual(topKeyAndId({ LIGHTS: [{ ID: '7' }] }), {
      key: 'LIGHTS',
      idPart: '[7]',
      id: '7',
    });
  });

  it('returns just the key when value is a non-object', () => {
    assert.deepEqual(topKeyAndId({ MODE: 'auto' as unknown as Record<string, unknown> }), undefined);
  });

  it('handles object (non-array) value with ID', () => {
    assert.deepEqual(topKeyAndId({ COVER: { ID: '3', state: 'open' } }), {
      key: 'COVER',
      idPart: '[3] open',
      id: '3',
    });
  });

  it('returns undefined for an empty object', () => {
    assert.equal(topKeyAndId({}), undefined);
  });
});

describe('extractChangeChildren', () => {
  it('emits one child per top-level type and counts device entries', () => {
    const { summary, children } = extractChangeChildren({
      'lares4 console': {
        LIGHTS: [
          { ID: '1', STA: 'ON' },
          { ID: '2', STA: 'OFF' },
        ],
        ZONES: [{ ID: '5', STA: 'OPEN' }],
      },
    });
    assert.equal(children.length, 2);
    assert.equal(summary, '3 items');
    assert.deepEqual(children.map((c) => c.line), ['LIGHTS', 'ZONES']);
  });

  it('lists the type even when device fields are sparse', () => {
    const { children, summary } = extractChangeChildren({
      LIGHTS: [{ ID: '9', POW: 12, foo: 'bar' }],
    });
    assert.equal(children.length, 1);
    assert.equal(children[0]!.line, 'LIGHTS');
    assert.equal(summary, '1 items');
  });

  it('returns empty when payload is not an object', () => {
    assert.deepEqual(extractChangeChildren('hello'), { summary: '', children: [] });
    assert.deepEqual(extractChangeChildren(null), { summary: '', children: [] });
    assert.deepEqual(extractChangeChildren([1, 2, 3]), { summary: '', children: [] });
  });

  it('emits every top-level type without truncation', () => {
    const payload: Record<string, unknown> = {};
    for (const k of ['A', 'B', 'C', 'D']) {
      payload[k] = [{ ID: '1', STA: 'X' }];
    }
    const { summary, children } = extractChangeChildren(payload);
    assert.equal(summary, '4 items');
    assert.equal(children.length, 4);
    assert.deepEqual(children.map((c) => c.line), ['A', 'B', 'C', 'D']);
  });
});

describe('summarizeForPreview', () => {
  it('renders RAW_RX as CMD/PAYLOAD_TYPE', () => {
    assert.equal(
      summarizeForPreview('RAW_RX', { CMD: 'REALTIME', PAYLOAD_TYPE: 'CHANGES' }, 'fallback'),
      'REALTIME/CHANGES',
    );
  });

  it('falls back to CMD when PAYLOAD_TYPE is missing', () => {
    assert.equal(summarizeForPreview('RAW_TX', { CMD: 'LOGIN' }, 'fallback'), 'LOGIN');
  });

  it('renders ACK with RESULT_DETAIL preferred over RESULT', () => {
    assert.equal(
      summarizeForPreview('ACK', { PAYLOAD: { RESULT: 'OK', RESULT_DETAIL: 'LOGIN_OK' } }, 'fallback'),
      'RESULT: LOGIN_OK',
    );
    assert.equal(
      summarizeForPreview('ACK', { PAYLOAD: { RESULT: 'OK' } }, 'fallback'),
      'RESULT: OK',
    );
  });

  it('renders CHANGE as the top-level type only', () => {
    assert.equal(
      summarizeForPreview('CHANGE', { LIGHTS: [{ ID: '1', STA: 'ON' }] }, 'fallback'),
      'LIGHTS',
    );
  });

  it('renders BULK with type count and first few keys', () => {
    const out = summarizeForPreview('BULK', { LIGHTS: [], ZONES: [], COVERS: [], OUT: [] }, 'fallback');
    assert.match(out, /^4 types: LIGHTS, ZONES, COVERS…$/);
  });

  it('returns fallback for non-object payload', () => {
    assert.equal(summarizeForPreview('LOG', 'hi', 'fallback'), 'fallback');
    assert.equal(summarizeForPreview('LOG', null, 'fallback'), 'fallback');
  });
});

describe('formatLogClock', () => {
  it('formats valid timestamps as HH:MM:SS', () => {
    const ts = new Date(2024, 0, 1, 9, 5, 7).toISOString();
    assert.match(formatLogClock(ts), /^\d{2}:\d{2}:\d{2}$/);
  });

  it('returns placeholder for invalid timestamps', () => {
    assert.equal(formatLogClock('not-a-date'), '--:--:--');
  });
});

describe('getLogViewport', () => {
  const entries: LogEntry[] = Array.from({ length: 10 }, (_, i) =>
    entry({ tag: 'LOG', ts: new Date(i * 1000).toISOString(), message: `m${String(i)}`, entryId: String(i) }),
  );

  it('returns the trailing window for scrollOffset=0', () => {
    const vp = getLogViewport(entries, 0, 3);
    assert.equal(vp.start, 7);
    assert.equal(vp.end, 10);
    assert.equal(vp.visible.length, 3);
    assert.equal(vp.maxOffset, 7);
  });

  it('shifts the window backwards as scrollOffset increases', () => {
    const vp = getLogViewport(entries, 4, 3);
    assert.equal(vp.start, 3);
    assert.equal(vp.end, 6);
  });

  it('clamps scrollOffset to maxOffset', () => {
    const vp = getLogViewport(entries, 9999, 3);
    assert.equal(vp.start, 0);
    assert.equal(vp.end, 3);
  });

  it('handles pageSize 0/negative defensively', () => {
    const vp = getLogViewport(entries, 0, 0);
    assert.equal(vp.visible.length, 1);
  });
});

describe('buildRenderRows', () => {
  it('produces one entry row per LogEntry plus separators across blocks', () => {
    const rows = buildRenderRows([
      entry({ tag: 'LOG', ts: new Date(0).toISOString(), message: 'a', groupId: 'g1' }),
      entry({ tag: 'LOG', ts: new Date(1000).toISOString(), message: 'b', groupId: 'g2' }),
    ]);
    const entries = rows.filter((r) => r.kind === 'entry');
    const separators = rows.filter((r) => r.kind === 'separator');
    assert.equal(entries.length, 2);
    assert.equal(separators.length, 1);
  });

  it('marks separators as strong when the gap exceeds gapMs', () => {
    const rows = buildRenderRows(
      [
        entry({ tag: 'LOG', ts: new Date(0).toISOString(), message: 'a', groupId: 'g1' }),
        entry({ tag: 'LOG', ts: new Date(10_000).toISOString(), message: 'b', groupId: 'g2' }),
      ],
      3000,
    );
    const sep = rows.find((r) => r.kind === 'separator');
    assert.ok(sep);
    assert.equal(sep!.strong, true);
  });

  it('collapses folded entries into a single row by default', () => {
    const rows = buildRenderRows([
      entry({
        tag: 'BULK',
        ts: new Date(0).toISOString(),
        message: 'BULK summary',
        folded: { preview: 'first', full: 'first\nsecond\nthird' },
        entryId: 'b1',
      }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.foldedCollapsed, true);
    assert.match(rows[0]!.text, /\[collapsed\]$/);
  });

  it('expands folded entries when group id is in expandedFoldGroups', () => {
    const expanded = new Set(['b1']);
    const rows = buildRenderRows(
      [
        entry({
          tag: 'BULK',
          ts: new Date(0).toISOString(),
          message: 'ignored',
          folded: { preview: 'first', full: 'first\nsecond\nthird' },
          groupId: 'b1',
        }),
      ],
      3000,
      expanded,
    );
    assert.equal(rows.length, 3);
    assert.equal(rows[0]!.foldedCollapsed, false);
    assert.equal(rows[0]!.selectable, true);
    assert.equal(rows[1]!.selectable, false);
  });
});

describe('buildMessageListItems', () => {
  it('pairs a RAW_RX wire frame with its decoded CHANGE twin', () => {
    const decoded = { 'lares4 console': { LIGHTS: [{ ID: '1', STA: 'ON' }] } };
    const items = buildMessageListItems([
      entry({
        tag: 'RAW_RX',
        ts: new Date(0).toISOString(),
        message: '← REALTIME',
        groupId: 'wire-1',
        payload: { CMD: 'REALTIME', PAYLOAD_TYPE: 'CHANGES', PAYLOAD: decoded },
      }),
      entry({
        tag: 'CHANGE',
        ts: new Date(1).toISOString(),
        message: 'lares4 console',
        groupId: 'wire-1',
        payload: decoded,
      }),
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.tag, 'CHANGE');
    assert.ok(items[0]!.wireFrame);
    assert.deepEqual(items[0]!.wireFrame!.payload, {
      CMD: 'REALTIME',
      PAYLOAD_TYPE: 'CHANGES',
      PAYLOAD: decoded,
    });
  });

  it('keeps the ACK metadata on a RAW_TX entry', () => {
    const items = buildMessageListItems([
      entry({
        tag: 'RAW_TX',
        ts: new Date(0).toISOString(),
        message: '→ LIGHTS',
        groupId: 'tx-1',
        correlationId: '42',
        payload: { CMD: 'LIGHTS' },
        ack: { result: 'OK', latencyMs: 24 },
      }),
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.correlationId, '42');
    assert.deepEqual(items[0]!.ack, { result: 'OK', latencyMs: 24 });
  });

  it('merges consecutive identical mergeable items into a single repeat counter', () => {
    const sample = (ts: number, n: string): LogEntry =>
      entry({
        tag: 'ACK',
        ts: new Date(ts).toISOString(),
        message: 'identical',
        groupId: `g-${n}`,
        payload: { PAYLOAD: { RESULT: 'OK' } },
      });
    const items = buildMessageListItems([sample(0, 'a'), sample(1, 'b'), sample(2, 'c')]);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.repeat, 3);
    assert.equal(items[0]!.merged?.length, 3);
  });

  it('does not merge across different tags', () => {
    const items = buildMessageListItems([
      entry({ tag: 'ACK', ts: new Date(0).toISOString(), message: 'a', groupId: 'g1' }),
      entry({ tag: 'CHANGE', ts: new Date(1).toISOString(), message: 'a', groupId: 'g2' }),
    ]);
    assert.equal(items.length, 2);
  });
});

describe('getVisibleRenderRowsFromFlat / getVisibleRenderRows', () => {
  const flat = Array.from({ length: 10 }, (_, i) => ({
    kind: 'entry' as const,
    id: `r${String(i)}`,
    text: `row ${String(i)}`,
    selectable: true,
  }));

  it('returns the trailing slice for scrollOffset=0', () => {
    const out = getVisibleRenderRowsFromFlat(flat, 0, 3);
    assert.equal(out.totalRows, 10);
    assert.equal(out.maxOffset, 7);
    assert.equal(out.rows.length, 3);
    assert.equal(out.rows[2]!.id, 'r9');
  });

  it('includes overscan rows on top of the page', () => {
    const out = getVisibleRenderRowsFromFlat(flat, 0, 3, 2);
    assert.ok(out.rows.length >= 3);
  });

  it('builds rows from entries via getVisibleRenderRows', () => {
    const entries: LogEntry[] = Array.from({ length: 4 }, (_, i) =>
      entry({ tag: 'LOG', ts: new Date(i * 1000).toISOString(), message: `m${String(i)}`, groupId: `g${String(i)}` }),
    );
    const out = getVisibleRenderRows(entries, 0, 4);
    assert.ok(out.rows.length > 0);
    assert.ok(out.totalRows >= entries.length);
  });
});
