import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  RecentActivityPane,
  collectRecentDeviceIds,
} from '../../src/desktop/components/RecentActivityPane.js';
import type { LogEntry } from '../../src/core/types.js';
import type { TopologySnapshot } from '../../src/core/topology.js';

const topology: TopologySnapshot = {
  total: 3,
  groups: [
    {
      kind: 'lights',
      label: 'Lights',
      count: 1,
      nodes: [{ kind: 'lights', id: '1', label: 'Kitchen', status: 'on', raw: {} }],
    },
    {
      kind: 'outputs',
      label: 'Outputs',
      count: 1,
      nodes: [{ kind: 'outputs', id: '1', label: 'Kitchen', status: 'on', raw: {} }],
    },
    {
      kind: 'system',
      label: 'System',
      count: 1,
      nodes: [{ kind: 'system', id: '1', label: 'Panel', status: 'unknown', raw: {} }],
    },
  ],
};

function entry(overrides: Partial<LogEntry> & { tag: LogEntry['tag']; ts: string }): LogEntry {
  return {
    level: 'info',
    message: '',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('RecentActivityPane', () => {
  it('shows the waiting message when there are no activity-eligible entries', () => {
    render(<RecentActivityPane entries={[]} topology={topology} onFilterById={() => {}} />);
    assert.ok(screen.getByText(/waiting for device events/i));
  });

  it('renders an activity row for a sender-wrapped STATUS_OUTPUTS CHANGE entry', async () => {
    const user = userEvent.setup();
    const onFilterById = mock.fn();
    const ts = new Date().toISOString();
    const entries: LogEntry[] = [
      entry({
        tag: 'CHANGE',
        ts,
        message: 'lares4 console',
        payload: { 'A4580F943BB3': { STATUS_OUTPUTS: [{ ID: '1', STA: 'ON' }] } },
      }),
    ];
    render(
      <RecentActivityPane entries={entries} topology={topology} onFilterById={onFilterById} />,
    );
    assert.ok(screen.getByText('Kitchen'));
    await user.click(screen.getByRole('button', { name: /kitchen/i }));
    assert.equal(onFilterById.mock.callCount(), 1);
    assert.equal(onFilterById.mock.calls[0]!.arguments[0], '1');
  });

  it('renders an activity row for a bare-unwrapped STATUS_SYSTEM CHANGE entry', () => {
    const ts = new Date().toISOString();
    const entries: LogEntry[] = [
      entry({
        tag: 'CHANGE',
        ts,
        message: 'system',
        payload: { STATUS_SYSTEM: [{ ID: '1', TEMP: { IN: '21.4' } }] },
      }),
    ];
    render(
      <RecentActivityPane entries={entries} topology={topology} onFilterById={() => {}} />,
    );
    assert.ok(screen.getByText('Panel'));
  });

  it('drops entries outside the window', () => {
    const stale = new Date(Date.now() - 60_000).toISOString();
    const entries: LogEntry[] = [
      entry({
        tag: 'CHANGE',
        ts: stale,
        message: 'old',
        payload: { 'A4580F943BB3': { STATUS_OUTPUTS: [{ ID: '1', STA: 'ON' }] } },
      }),
    ];
    render(
      <RecentActivityPane entries={entries} topology={topology} onFilterById={() => {}} windowMs={5000} />,
    );
    assert.ok(screen.getByText(/waiting for device events/i));
  });
});

describe('collectRecentDeviceIds', () => {
  it('returns the set of ids touched in the window (sender-wrapped)', () => {
    const ts = new Date().toISOString();
    const entries: LogEntry[] = [
      entry({
        tag: 'CHANGE',
        ts,
        message: 'a',
        payload: { 'A4580F943BB3': { STATUS_OUTPUTS: [{ ID: '1', STA: 'ON' }] } },
      }),
    ];
    const ids = collectRecentDeviceIds(entries, topology);
    assert.ok(ids.has('1'));
  });
});
