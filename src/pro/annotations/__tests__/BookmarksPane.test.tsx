// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookmarksPane } from '../ui/BookmarksPane.js';
import { TabsProvider } from '../../tabs/context.js';
import { TooltipProvider } from '../../../components/ui/tooltip.js';
import type { LogEntry } from '../../../core/types.js';
import type { Bookmark } from '../types.js';

function bookmark(id: string, note?: string): Bookmark {
  return { groupId: id, note, createdAt: new Date(0).toISOString() };
}

const entries: LogEntry[] = [
  {
    ts: new Date(1000).toISOString(),
    level: 'info',
    tag: 'CHANGE',
    message: 'kitchen',
    groupId: 'g1',
    payload: { LIGHTS: [{ ID: '1', STA: 'ON' }] },
  },
];

interface WrapProps {
  bookmarks?: Bookmark[];
  onRemove?: (id: string) => void;
  onSelect?: (id: string) => void;
  isLicensed?: boolean;
}

function Wrap(props: WrapProps) {
  return (
    <TabsProvider>
      <TooltipProvider>
        <BookmarksPane
          bookmarks={props.bookmarks ?? []}
          entries={entries}
          onSelect={props.onSelect ?? (() => {})}
          onRemove={props.onRemove ?? (() => {})}
          onUpdateNote={() => {}}
          onExport={async () => undefined}
          isLicensed={props.isLicensed ?? true}
        />
      </TooltipProvider>
    </TabsProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('BookmarksPane', () => {
  it('renders the empty state when there are no bookmarks', () => {
    render(<Wrap />);
    assert.ok(screen.getByText('No bookmarks'));
  });

  it('renders a row for each bookmark', () => {
    render(<Wrap bookmarks={[bookmark('g1', 'kitchen note')]} />);
    assert.ok(screen.getByText(/kitchen note/i));
  });

  it('clicking the remove button calls onRemove with the groupId', async () => {
    const user = userEvent.setup();
    const onRemove = mock.fn();
    render(<Wrap bookmarks={[bookmark('g1')]} onRemove={onRemove} />);
    const removeButton = screen.getByRole('button', { name: /remove/i });
    await user.click(removeButton);
    assert.equal(onRemove.mock.callCount(), 1);
    assert.equal(onRemove.mock.calls[0]!.arguments[0], 'g1');
  });
});
