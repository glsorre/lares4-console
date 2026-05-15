import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { executeCommand, type CommandContext, type CommandOutputItem } from '../src/core/command-router.js';
import { applyLogQuery } from '../src/core/log-query.js';
import { buildMessageListItems } from '../src/core/log-view.js';
import type { LogEntry } from '../src/core/types.js';

const baseCtx: CommandContext = {
  lares: {
    switchOn: () => undefined,
    switchOff: () => undefined,
    dimmerTo: () => undefined,
    rollUp: () => undefined,
    rollDown: () => undefined,
    rollStop: () => undefined,
    rollTo: () => undefined,
    triggerScenario: () => undefined,
  } as unknown as CommandContext['lares'],
  socketSend: () => undefined,
  outputFormat: 'pretty',
  getStateSnapshot: (scope: string) => ({ scope }),
};

function itemText(it: CommandOutputItem): string {
  return typeof it === 'string' ? it : it.text;
}

function itemPayload(it: CommandOutputItem): unknown {
  return typeof it === 'string' ? undefined : it.payload;
}

interface PipelineRun {
  items: CommandOutputItem[];
  entries: LogEntry[];
  filtered: LogEntry[];
}

// Mirrors session-controller.ts:564-572 (pushCommandMessage) so router output is
// shaped into log entries the same way production does. If that seam changes,
// update this helper in lockstep — that's the contract this test pins.
async function runPipeline(line: string, query: string, ctx: CommandContext = baseCtx): Promise<PipelineRun> {
  const items = await executeCommand(line, ctx);
  const groupId = `cmd-${line}`;
  const trimmed = line.trim();
  const entries: LogEntry[] = items.map((it, idx) => ({
    ts: `12:00:${String(idx).padStart(2, '0')}`,
    level: 'info' as const,
    tag: 'LOG' as const,
    source: 'command' as const,
    groupId,
    command: idx === 0 && trimmed.length > 0 ? trimmed : undefined,
    message: itemText(it),
    payload: itemPayload(it),
  }));
  const filtered = applyLogQuery(entries, query);
  return { items, entries, filtered };
}

describe('core pipeline (command-router → log-query → log-view)', () => {
  it('raw sendcmd flows end-to-end through router, query, and view', async () => {
    let sent: unknown[] | undefined;
    const ctx: CommandContext = {
      ...baseCtx,
      socketSend: (cmd, payloadType, payload) => {
        sent = [cmd, payloadType, payload];
      },
    };
    const { items, entries, filtered } = await runPipeline(
      'raw sendcmd {"CMD":"X","PAYLOAD_TYPE":"Y","PAYLOAD":{"a":1}}',
      '',
      ctx,
    );

    assert.deepEqual(sent, ['X', 'Y', { a: 1 }]);
    assert.ok(items.length >= 1, 'router produced at least one output item');
    assert.equal(filtered.length, entries.length, 'empty query is identity');

    const messageItems = buildMessageListItems(filtered);
    assert.equal(messageItems.length, 1, 'all entries collapse into one group');
    const [only] = messageItems;
    assert.ok(only);
    assert.equal(only.tag, 'LOG');
    assert.equal(only.source, 'command');
    assert.ok(only.content.includes('raw sendcmd X Y'));
  });

  it('free-text chip filters router output by message substring', async () => {
    const raw = await runPipeline(
      'raw sendcmd {"CMD":"X","PAYLOAD_TYPE":"Y","PAYLOAD":{"a":1}}',
      '',
    );
    const stateCtx: CommandContext = {
      ...baseCtx,
      getStateSnapshot: () => ({ room: 'kitchen', level: 90 }),
    };
    const state = await runPipeline('state lights', '', stateCtx);

    const combined = [...raw.entries, ...state.entries];
    const keepRaw = applyLogQuery(combined, 'sendcmd');
    assert.ok(keepRaw.length >= 1);
    assert.ok(keepRaw.every((e) => e.message.toLowerCase().includes('sendcmd')));
    assert.ok(!keepRaw.some((e) => e.message.includes('kitchen')));

    const keepState = applyLogQuery(combined, 'kitchen');
    assert.ok(keepState.length >= 1);
    assert.ok(keepState.every((e) => e.message.toLowerCase().includes('kitchen')));
    assert.ok(!keepState.some((e) => e.message.includes('sendcmd')));
  });

  it('payload-path chip matches against router-produced payload (state snapshot)', async () => {
    const ctx: CommandContext = {
      ...baseCtx,
      getStateSnapshot: () => ({ room: 'kitchen', level: 90 }),
    };
    const { entries, filtered } = await runPipeline('state lights', 'payload.room=kitchen', ctx);

    assert.equal(filtered.length, entries.length, 'all state entries carry payload.room=kitchen');
    const items = buildMessageListItems(filtered);
    assert.equal(items.length, 1);
    const [only] = items;
    assert.ok(only);
    assert.deepEqual(only.payload, { room: 'kitchen', level: 90 });

    const noMatch = applyLogQuery(entries, 'payload.room=bathroom');
    assert.equal(noMatch.length, 0);
  });

  it('empty query is identity; view groups entries by groupId', async () => {
    const raw = await runPipeline(
      'raw sendcmd {"CMD":"X","PAYLOAD_TYPE":"Y","PAYLOAD":{"a":1}}',
      '',
    );
    const stateCtx: CommandContext = {
      ...baseCtx,
      getStateSnapshot: () => ({ room: 'kitchen', level: 90 }),
    };
    const state = await runPipeline('state lights', '', stateCtx);

    const combined = [...raw.entries, ...state.entries];
    const passthrough = applyLogQuery(combined, '');
    assert.equal(passthrough.length, combined.length);

    const items = buildMessageListItems(passthrough);
    const uniqueGroupIds = new Set(combined.map((e) => e.groupId));
    assert.equal(items.length, uniqueGroupIds.size);
    const itemIds = new Set(items.map((i) => i.id));
    for (const gid of uniqueGroupIds) {
      assert.ok(gid && itemIds.has(gid));
    }
  });
});
