import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EventFilter } from '../src/core/types.js';
import { executeCommand } from '../src/core/command-router.js';

describe('command router additional coverage', () => {
  const baseCtx = {
    lares: {
      switchOn: (id: number) => { void id; },
      switchOff: (id: number) => { void id; },
      dimmerTo: (id: number, level: number) => { void id; void level; },
      rollUp: (id: number) => { void id; },
      rollDown: (id: number) => { void id; },
      rollStop: (id: number) => { void id; },
      rollTo: (id: number, pos: number) => { void id; void pos; },
      triggerScenario: (id: number) => { void id; },
    },
    socketSend: (cmd: string, payloadType: string, payload: Record<string, unknown>) => {
      void cmd;
      void payloadType;
      void payload;
    },
    outputFormat: 'pretty' as const,
    eventFilters: new Set<EventFilter>(['all']),
    onEventFiltersChanged: (next: Set<EventFilter>) => { void next; },
    onFormatChanged: (fmt: string) => { void fmt; },
    rawFullEnabled: false,
    onRawFullChanged: (enabled: boolean) => { void enabled; },
    onExport: async (path?: string) => path ?? 'x.log',
    getStateSnapshot: (scope: string) => {
      void scope;
      return { ok: true };
    },
  };

  it('supports raw send with quoted json payload', async () => {
    let sent: unknown[] = [];
    const lines = await executeCommand(`raw send X Y '{"a":1,"b":"v"}'`, {
      ...baseCtx,
      socketSend: (cmd, payloadType, payload) => {
        sent = [cmd, payloadType, payload];
      },
    });
    assert.deepEqual(sent, ['X', 'Y', { a: 1, b: 'v' }]);
    assert.match(lines[0] ?? '', /raw send X Y/);
  });

  it('reports invalid json for raw send', async () => {
    await assert.rejects(
      () => executeCommand('raw send X Y {bad-json}', baseCtx),
      /Invalid JSON payload for raw send/,
    );
  });

  it('reports invalid json for raw sendcmd', async () => {
    await assert.rejects(
      () => executeCommand('raw sendcmd {bad-json}', baseCtx),
      /Invalid JSON payload for raw sendcmd/,
    );
  });

  it('runs lights/covers/scenario commands', async () => {
    const calls: string[] = [];
    const ctx = {
      ...baseCtx,
      lares: {
        ...baseCtx.lares,
        switchOn: (id: number) => { calls.push(`switchOn:${String(id)}`); },
        rollTo: (id: number, pos: number) => { calls.push(`rollTo:${String(id)}:${String(pos)}`); },
        triggerScenario: (id: number) => { calls.push(`scenario:${String(id)}`); },
      },
    };
    assert.match((await executeCommand('lights on 11', ctx))[0] ?? '', /ok lights on id=11/);
    assert.match((await executeCommand('covers to 3 90', ctx))[0] ?? '', /ok covers to id=3/);
    assert.match((await executeCommand('scenario trigger 7', ctx))[0] ?? '', /ok scenario trigger id=7/);
    assert.deepEqual(calls, ['switchOn:11', 'rollTo:3:90', 'scenario:7']);
  });

  it('supports format and export commands', async () => {
    const formatLines = await executeCommand('format json', baseCtx);
    assert.equal(formatLines[0], 'Output format set to: json');

    const exportLines = await executeCommand('export custom.log', baseCtx);
    assert.equal(exportLines[0], 'Session exported to: custom.log');
  });

  it('returns command help lines', async () => {
    const lines = await executeCommand('help', baseCtx);
    assert.ok(lines.length > 6);
    assert.equal(lines[0], 'Commands:');
    assert.ok(lines.some((line) => line.includes('raw send')));
  });
});

