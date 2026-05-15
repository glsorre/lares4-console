// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriggersPane } from '../ui/TriggersPane.js';
import { TabsProvider } from '../../tabs/context.js';
import { TooltipProvider } from '../../../components/ui/tooltip.js';
import type { TriggerRule } from '../engine.js';

function Wrap(props: { triggers?: TriggerRule[]; onSave?: (next: TriggerRule[]) => Promise<void>; isLicensed?: boolean }) {
  return (
    <TabsProvider>
      <TooltipProvider>
        <TriggersPane
          triggers={props.triggers ?? []}
          onSave={props.onSave ?? (async () => {})}
          isLicensed={props.isLicensed ?? true}
        />
      </TooltipProvider>
    </TabsProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('TriggersPane', () => {
  it('renders the empty state when licensed but no rules', () => {
    render(<Wrap />);
    assert.ok(screen.getByText('No trigger rules'));
    assert.ok(screen.getByRole('button', { name: /add rule/i }));
  });

  it('renders a Pro notice in read-only mode when isLicensed=false', () => {
    render(<Wrap isLicensed={false} />);
    assert.match(document.body.textContent ?? '', /commercial feature/i);
    assert.equal(screen.queryByRole('button', { name: /add rule/i }), null);
  });

  it('shows existing rule rows with their match field prefilled', () => {
    const rules: TriggerRule[] = [
      {
        id: 'r1',
        name: 'ack errors',
        enabled: true,
        match: 'tag:ERROR',
        actions: [{ kind: 'highlight', color: 'red' }],
      },
    ];
    render(<Wrap triggers={rules} />);
    const nameInputs = screen.getAllByPlaceholderText('Rule name') as HTMLInputElement[];
    assert.equal(nameInputs[0]!.value, 'ack errors');
    const matchInputs = screen.getAllByPlaceholderText('tag:ACK level:error') as HTMLInputElement[];
    assert.equal(matchInputs[0]!.value, 'tag:ERROR');
  });

  it('adds a new draft rule when Add rule is clicked', async () => {
    const user = userEvent.setup();
    render(<Wrap />);
    await user.click(screen.getByRole('button', { name: /add rule/i }));
    const matchInputs = screen.getAllByPlaceholderText('tag:ACK level:error');
    assert.equal(matchInputs.length, 1);
  });

  it('invokes onSave with the current draft when Save is clicked', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn(async () => {});
    const rules: TriggerRule[] = [
      {
        id: 'r1',
        name: 'errors',
        enabled: true,
        match: 'tag:ERROR',
        actions: [{ kind: 'highlight', color: 'red' }],
      },
    ];
    render(<Wrap triggers={rules} onSave={onSave} />);
    const saveButton = screen.getByRole('button', { name: /save rules/i });
    await user.click(saveButton);
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
  });
});
