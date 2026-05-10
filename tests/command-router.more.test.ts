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

  it('routes record/replay commands to runtime handlers', async () => {
    const record = await executeCommand('record start out.ndjson', {
      ...baseCtx,
      onRecordCommand: async (args) => [`record:${args.join(',')}`],
    });
    const replay = await executeCommand('replay play', {
      ...baseCtx,
      onReplayCommand: async (args) => [`replay:${args.join(',')}`],
    });
    assert.equal(record[0], 'record:start,out.ndjson');
    assert.equal(replay[0], 'replay:play');
  });

  it('supports new entity command families', async () => {
    const calls: string[] = [];
    const ctx = {
      ...baseCtx,
      lares: {
        ...baseCtx.lares,
        armZone: (id: number) => { calls.push(`armZone:${String(id)}`); },
        outputToggle: (id: number) => { calls.push(`outputToggle:${String(id)}`); },
        openGate: (id: number) => { calls.push(`openGate:${String(id)}`); },
        setThermostatMode: (id: number, mode: string) => { calls.push(`setThermostatMode:${String(id)}:${mode}`); },
      },
    };
    assert.match((await executeCommand('zones arm 2', ctx))[0] ?? '', /ok zones arm id=2/);
    assert.match((await executeCommand('outputs toggle 4', ctx))[0] ?? '', /ok outputs toggle id=4/);
    assert.match((await executeCommand('switches on 5', ctx))[0] ?? '', /ok switches on id=5/);
    assert.match((await executeCommand('gates open 6', ctx))[0] ?? '', /ok gates open id=6/);
    assert.match((await executeCommand('thermostats mode 1 heat', ctx))[0] ?? '', /ok thermostats mode id=1 value=heat/);
    assert.deepEqual(calls, ['armZone:2', 'outputToggle:4', 'openGate:6', 'setThermostatMode:1:heat']);
  });
});

