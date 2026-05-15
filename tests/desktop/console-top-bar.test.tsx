import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React, { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsoleTopBar } from '../../src/desktop/components/ConsoleTopBar.js';
import { TooltipProvider } from '../../src/components/ui/tooltip.js';
import type { SessionSnapshot } from '../../src/desktop/runtime/session-controller.js';

const baseSnapshot = {
  connected: true,
  connectionStatus: 'online',
  logEntries: [],
  pendingTxCount: 0,
  topology: { total: 0, groups: [] },
} as unknown as SessionSnapshot;

const disconnectedSnapshot = {
  ...baseSnapshot,
  connected: false,
} as unknown as SessionSnapshot;

interface Overrides {
  snapshot?: SessionSnapshot;
  msgCount?: number;
  sidebarOpen?: boolean;
  topologyRailOpen?: boolean;
  onToggleSidebar?: () => void;
  onToggleTopologyRail?: () => void;
  onClearLogs?: () => void;
  onExportLogs?: () => void;
  onSearchInputChange?: (next: string) => void;
}

function Harness(props: Overrides) {
  const [search, setSearch] = useState('');
  return (
    <TooltipProvider>
      <ConsoleTopBar
        snapshot={props.snapshot ?? baseSnapshot}
        msgCount={props.msgCount ?? 0}
        sidebarOpen={props.sidebarOpen ?? false}
        topologyRailOpen={props.topologyRailOpen ?? false}
        searchInput={search}
        onSearchInputChange={(next) => {
          setSearch(next);
          props.onSearchInputChange?.(next);
        }}
        onToggleSidebar={props.onToggleSidebar ?? (() => {})}
        onToggleTopologyRail={props.onToggleTopologyRail ?? (() => {})}
        onClearLogs={props.onClearLogs ?? (() => {})}
        onExportLogs={props.onExportLogs ?? (() => {})}
      />
    </TooltipProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('ConsoleTopBar', () => {
  it('renders the sidebar toggle with state-aware aria label', () => {
    render(<Harness sidebarOpen={false} />);
    assert.ok(screen.getByRole('button', { name: /open connections panel/i }));
    cleanup();
    render(<Harness sidebarOpen />);
    assert.ok(screen.getByRole('button', { name: /close connections panel/i }));
  });

  it('invokes onToggleSidebar when the toggle is clicked', async () => {
    const user = userEvent.setup();
    const onToggleSidebar = mock.fn();
    render(<Harness onToggleSidebar={onToggleSidebar} />);
    await user.click(screen.getByRole('button', { name: /open connections panel/i }));
    assert.equal(onToggleSidebar.mock.callCount(), 1);
  });

  it('renders the Clear logs button only when msgCount > 0 and wires onClearLogs', async () => {
    const user = userEvent.setup();
    const onClearLogs = mock.fn();
    render(<Harness msgCount={0} onClearLogs={onClearLogs} />);
    assert.equal(screen.queryByRole('button', { name: /clear logs/i }), null);
    cleanup();
    render(<Harness msgCount={5} onClearLogs={onClearLogs} />);
    await user.click(screen.getByRole('button', { name: /clear logs/i }));
    assert.equal(onClearLogs.mock.callCount(), 1);
  });

  it('hides the search input when disconnected', () => {
    render(<Harness snapshot={disconnectedSnapshot} />);
    assert.equal(screen.queryByLabelText('Search log entries'), null);
  });

  it('shows the search input when connected and propagates onSearchInputChange', async () => {
    const user = userEvent.setup();
    const onSearchInputChange = mock.fn();
    render(<Harness onSearchInputChange={onSearchInputChange} />);
    const input = screen.getByLabelText('Search log entries') as HTMLInputElement;
    input.focus();
    await user.keyboard('a');
    assert.ok(onSearchInputChange.mock.callCount() >= 1);
    const lastCall = onSearchInputChange.mock.calls.at(-1)!;
    assert.equal(lastCall.arguments[0], 'a');
  });

  it('shows the Devices button only when connected and the rail is closed', () => {
    render(<Harness topologyRailOpen={false} />);
    assert.ok(screen.getByRole('button', { name: /open devices rail/i }));
    cleanup();
    render(<Harness topologyRailOpen />);
    assert.equal(screen.queryByRole('button', { name: /open devices rail/i }), null);
  });
});
