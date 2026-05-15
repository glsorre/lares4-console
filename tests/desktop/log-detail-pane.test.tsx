import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { TabsProvider } from '../../src/pro/tabs/context.js';
import { TooltipProvider } from '../../src/components/ui/tooltip.js';
import { LogDetailPane } from '../../src/desktop/components/LogDetailPane.js';
import type { LogEntry } from '../../src/core/types.js';

function Wrap({ entries, selectedId }: { entries: LogEntry[]; selectedId?: string }) {
  return (
    <TabsProvider>
      <TooltipProvider>
        <LogDetailPane entries={entries} selectedId={selectedId} outputFormat="pretty" />
      </TooltipProvider>
    </TabsProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('LogDetailPane wire pair', () => {
  it('renders Wire and Decoded cards when wireFrame is paired with CHANGE', () => {
    const decodedPayload = { 'lares4 console': { LIGHTS: [{ ID: '1', STA: 'ON' }] } };
    const rawPayload = {
      CMD: 'REALTIME',
      PAYLOAD_TYPE: 'CHANGES',
      PAYLOAD: decodedPayload,
    };
    const entries: LogEntry[] = [
      {
        ts: new Date(2000).toISOString(),
        level: 'debug',
        tag: 'RAW_RX',
        source: 'wire',
        groupId: 'wire-1',
        message: '← REALTIME/CHANGES',
        payload: rawPayload,
        entryId: 'r1',
      },
      {
        ts: new Date(2001).toISOString(),
        level: 'info',
        tag: 'CHANGE',
        source: 'lifecycle',
        groupId: 'wire-1',
        message: 'lares4 console',
        payload: decodedPayload,
        entryId: 'c1',
      },
    ];
    render(<Wrap entries={entries} selectedId="wire-1" />);

    // The pair header announces both halves.
    assert.ok(screen.getByLabelText('Wire frame and decoded pair'));
    // Each PairCard exposes an aria-label "<Role> (<Tag>)".
    assert.ok(screen.getByLabelText('Wire (RAW_RX)'));
    assert.ok(screen.getByLabelText('Decoded (CHANGE)'));
  });

  it('renders a single card when no wireFrame twin exists', () => {
    const entries: LogEntry[] = [
      {
        ts: new Date(3000).toISOString(),
        level: 'info',
        tag: 'CHANGE',
        source: 'lifecycle',
        message: 'lares4 console',
        payload: { 'lares4 console': { LIGHTS: [{ ID: '1' }] } },
        entryId: 'c1',
      },
    ];
    render(<Wrap entries={entries} selectedId="c1" />);

    assert.equal(screen.queryByLabelText('Wire frame and decoded pair'), null);
    assert.equal(screen.queryByLabelText('Wire (RAW_RX)'), null);
  });

  it('still renders the Request/Response pair view for TX↔ACK', () => {
    const entries: LogEntry[] = [
      {
        ts: new Date(4000).toISOString(),
        level: 'info',
        tag: 'RAW_TX',
        source: 'command',
        groupId: 'rawtx-42',
        correlationId: '42',
        message: '→ LIGHTS',
        payload: { CMD: 'LIGHTS', ID: '42', PAYLOAD: { STA: 'ON' } },
        ack: {
          result: 'OK',
          latencyMs: 24,
          payload: { PAYLOAD: { RESULT: 'OK' } },
          ts: new Date(4024).toISOString(),
        },
        entryId: 't1',
      },
    ];
    render(<Wrap entries={entries} selectedId="rawtx-42" />);

    assert.ok(screen.getByLabelText('Request and response pair'));
    assert.ok(screen.getByLabelText('Request (RAW_TX)'));
    assert.ok(screen.getByLabelText('Response (ACK)'));
    // Regression guard against accidental wire-pair fallback when ack is present.
    assert.equal(screen.queryByLabelText('Wire frame and decoded pair'), null);
  });
});
