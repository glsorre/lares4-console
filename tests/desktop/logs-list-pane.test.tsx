import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabsProvider } from '../../src/pro/tabs/context.js';
import { TooltipProvider } from '../../src/components/ui/tooltip.js';
import { LogsListPane } from '../../src/desktop/components/LogsListPane.js';
import type { LogEntry } from '../../src/core/types.js';

function entry(overrides: Partial<LogEntry> & { tag: LogEntry['tag']; ts: string; message: string }): LogEntry {
  return {
    level: 'info',
    ...overrides,
  };
}

const sampleEntries: LogEntry[] = [
  entry({ tag: 'LOG', ts: new Date(1000).toISOString(), message: 'first', groupId: 'g1' }),
  entry({ tag: 'CHANGE', ts: new Date(2000).toISOString(), message: 'second', groupId: 'g2' }),
  entry({ tag: 'ACK', ts: new Date(3000).toISOString(), message: 'third', groupId: 'g3' }),
];

interface HarnessProps {
  entries?: LogEntry[];
  selectedId?: string;
  searchInput?: string;
  onSelect?: (id: string) => void;
  onToggleBookmark?: (id: string) => void;
  onPinnedIdChange?: (id: string | undefined) => void;
  annotationsLicensed?: boolean;
  disableVirtualization?: boolean;
}

function Harness(props: HarnessProps) {
  return (
    <TabsProvider>
      <TooltipProvider>
        <LogsListPane
          entries={props.entries ?? sampleEntries}
          selectedId={props.selectedId}
          onSelect={props.onSelect ?? (() => {})}
          searchInput={props.searchInput ?? ''}
          bookmarkedIds={new Set()}
          onToggleBookmark={props.onToggleBookmark ?? (() => {})}
          pinnedId={undefined}
          onPinnedIdChange={props.onPinnedIdChange ?? (() => {})}
          annotationsLicensed={props.annotationsLicensed ?? true}
          disableVirtualization={props.disableVirtualization ?? true}
        />
      </TooltipProvider>
    </TabsProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('LogsListPane', () => {
  it('renders a listbox with one option per entry', () => {
    render(<Harness />);
    const listbox = screen.getByRole('listbox', { name: 'Log messages' });
    assert.ok(listbox);
    assert.equal(screen.getAllByRole('option').length, sampleEntries.length);
  });

  it('renders empty state when there are no entries', () => {
    render(<Harness entries={[]} />);
    assert.equal(screen.queryByRole('listbox'), null);
    assert.ok(screen.getByText('No messages yet'));
  });

  it('clicking a row invokes onSelect with the group id', async () => {
    const user = userEvent.setup();
    const onSelect = mock.fn();
    render(<Harness onSelect={onSelect} />);
    const options = screen.getAllByRole('option');
    await user.click(options[1]!);
    assert.equal(onSelect.mock.callCount(), 1);
    assert.equal(onSelect.mock.calls[0]!.arguments[0], 'g2');
  });

  it('ArrowDown moves selection to the next entry', () => {
    const onSelect = mock.fn();
    render(<Harness selectedId="g1" onSelect={onSelect} />);
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    assert.equal(onSelect.mock.callCount(), 1);
    assert.equal(onSelect.mock.calls[0]!.arguments[0], 'g2');
  });

  it('ArrowUp moves selection to the previous entry and clamps at first', () => {
    const onSelect = mock.fn();
    render(<Harness selectedId="g2" onSelect={onSelect} />);
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    assert.equal(onSelect.mock.calls[0]!.arguments[0], 'g1');
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    assert.equal(onSelect.mock.calls[1]!.arguments[0], 'g1');
  });

  it('End jumps to the last entry, Home to the first', () => {
    const onSelect = mock.fn();
    render(<Harness selectedId="g1" onSelect={onSelect} />);
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'End' });
    assert.equal(onSelect.mock.calls[0]!.arguments[0], 'g3');
    fireEvent.keyDown(listbox, { key: 'Home' });
    assert.equal(onSelect.mock.calls[1]!.arguments[0], 'g1');
  });

  it('clicking the bookmark button calls onToggleBookmark with the row id', async () => {
    const user = userEvent.setup();
    const onToggleBookmark = mock.fn();
    render(<Harness onToggleBookmark={onToggleBookmark} />);
    const buttons = screen.getAllByRole('button', { name: /bookmark row/i });
    await user.click(buttons[0]!);
    assert.equal(onToggleBookmark.mock.callCount(), 1);
    assert.equal(onToggleBookmark.mock.calls[0]!.arguments[0], 'g1');
  });

  it('marks the selected option via aria-selected', () => {
    render(<Harness selectedId="g2" />);
    const options = screen.getAllByRole('option');
    assert.equal(options[1]!.getAttribute('aria-selected'), 'true');
    assert.equal(options[0]!.getAttribute('aria-selected'), 'false');
  });

  it('renders the RAW chip on CHANGE rows with a paired wireFrame', () => {
    const entries: LogEntry[] = [
      entry({
        tag: 'CHANGE',
        ts: new Date(1000).toISOString(),
        message: 'change with raw',
        groupId: 'g-raw',
        wireFrame: { payload: { CMD: 'X' }, content: 'raw text', ts: new Date(900).toISOString() },
      }),
    ];
    render(<Harness entries={entries} />);
    assert.ok(screen.getByLabelText('Has paired raw frame'));
  });

  it('promotes the primary tag chip to RAW_RX when CHANGE has wireFrame', () => {
    const entries: LogEntry[] = [
      entry({
        tag: 'CHANGE',
        ts: new Date(1000).toISOString(),
        message: 'change with raw',
        groupId: 'g-raw-primary',
        wireFrame: { payload: { CMD: 'X' }, content: 'raw text', ts: new Date(900).toISOString() },
      }),
    ];
    render(<Harness entries={entries} />);
    assert.ok(screen.getByText('RAW_RX'));
    assert.ok(screen.getByLabelText('Has paired raw frame'));
  });

  it('does not render the RAW chip when CHANGE has no wireFrame', () => {
    const entries: LogEntry[] = [
      entry({ tag: 'CHANGE', ts: new Date(1000).toISOString(), message: 'plain change', groupId: 'g-plain' }),
    ];
    render(<Harness entries={entries} />);
    assert.equal(screen.queryByLabelText('Has paired raw frame'), null);
  });

  it('with virtualization enabled, only a small window of rows is mounted for large lists', () => {
    const bulk: LogEntry[] = Array.from({ length: 5000 }, (_, i) =>
      entry({
        tag: 'LOG',
        ts: new Date(1000 + i).toISOString(),
        message: `msg-${i}`,
        groupId: `g-${i}`,
      }),
    );
    render(<Harness entries={bulk} disableVirtualization={false} />);
    assert.ok(screen.getByRole('listbox', { name: 'Log messages' }));
    // happy-dom reports zero-sized viewport so the virtualizer renders only its
    // overscan window (or nothing); the contract is that we never DOM-mount
    // anywhere close to 5000 rows.
    assert.ok(screen.queryAllByRole('option').length < 100);
  });
});
