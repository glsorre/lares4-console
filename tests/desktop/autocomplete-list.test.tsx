import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AutocompleteList,
  autocompleteFlatCount,
  type AutocompleteGroup,
} from '../../src/desktop/components/AutocompleteList.js';

const groups: AutocompleteGroup[] = [
  {
    heading: 'Roots',
    items: [
      { key: 'help', label: 'help' },
      { key: 'format', label: 'format' },
    ],
  },
  {
    heading: 'Args',
    items: [{ key: 'pretty', label: 'pretty' }],
  },
];

afterEach(() => {
  cleanup();
});

describe('autocompleteFlatCount', () => {
  it('sums items across groups', () => {
    assert.equal(autocompleteFlatCount(groups), 3);
    assert.equal(autocompleteFlatCount([]), 0);
  });
});

describe('AutocompleteList', () => {
  it('renders one row per item across groups', () => {
    render(
      <AutocompleteList
        groups={groups}
        activeIndex={-1}
        onActiveChange={() => {}}
        onPick={() => {}}
      />,
    );
    assert.equal(screen.getAllByRole('option').length, 3);
  });

  it('shows the empty fallback when all groups are empty', () => {
    render(
      <AutocompleteList
        groups={[]}
        activeIndex={-1}
        onActiveChange={() => {}}
        onPick={() => {}}
        emptyText="Nothing here."
      />,
    );
    assert.ok(screen.getByText('Nothing here.'));
  });

  it('invokes onPick with the flat index when an item is clicked', async () => {
    const user = userEvent.setup();
    const onPick = mock.fn();
    render(
      <AutocompleteList
        groups={groups}
        activeIndex={-1}
        onActiveChange={() => {}}
        onPick={onPick}
      />,
    );
    await user.click(screen.getByRole('option', { name: 'pretty' }));
    assert.equal(onPick.mock.callCount(), 1);
    assert.equal(onPick.mock.calls[0]!.arguments[0], 2);
  });
});
