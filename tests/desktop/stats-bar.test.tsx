import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { StatsBar } from '../../src/desktop/components/StatsBar.js';
import type { LogEntry } from '../../src/core/types.js';

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

describe('StatsBar', () => {
  it('renders nothing when there are no entries', () => {
    const { container } = render(<StatsBar entries={[]} pendingTxCount={0} />);
    assert.equal(container.textContent, '');
  });

  it('renders evt/s and total pills for the entry set', () => {
    const now = new Date('2024-01-01T00:00:01.000Z').getTime();
    const entries: LogEntry[] = [
      entry({ tag: 'LOG', ts: new Date(now - 200).toISOString() }),
      entry({ tag: 'LOG', ts: new Date(now - 400).toISOString() }),
      entry({ tag: 'CHANGE', ts: new Date(now - 600).toISOString() }),
    ];
    render(<StatsBar entries={entries} pendingTxCount={0} />);
    assert.ok(screen.getByText('evt/s'));
    assert.ok(screen.getByText('total'));
    assert.ok(screen.getByText('3'));
  });

  it('renders the error pill only when an error entry is present', () => {
    const ts = new Date().toISOString();
    const entries: LogEntry[] = [
      entry({ tag: 'LOG', ts }),
      entry({ tag: 'ERROR', ts, level: 'error' }),
    ];
    render(<StatsBar entries={entries} pendingTxCount={0} />);
    assert.ok(screen.getByText('err'));
  });

  it('does not render the error pill when no errors', () => {
    render(
      <StatsBar
        entries={[entry({ tag: 'LOG', ts: new Date().toISOString() })]}
        pendingTxCount={0}
      />,
    );
    assert.equal(screen.queryByText('err'), null);
  });

  it('renders pending pill when pendingTxCount > 0', () => {
    render(
      <StatsBar
        entries={[entry({ tag: 'LOG', ts: new Date().toISOString() })]}
        pendingTxCount={3}
      />,
    );
    assert.ok(screen.getByText('pending'));
    assert.ok(screen.getByText('3'));
  });
});
