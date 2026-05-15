// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriggersDialog } from '../ui/TriggersDialog.js';
import type { TriggerRule } from '../engine.js';

const rules: TriggerRule[] = [
  {
    id: 'r1',
    name: 'errors',
    enabled: true,
    match: 'tag:ERROR',
    actions: [{ kind: 'highlight', color: 'red' }],
  },
];

afterEach(() => {
  cleanup();
});

describe('TriggersDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <TriggersDialog
        open={false}
        onOpenChange={() => {}}
        triggers={rules}
        onSave={async () => {}}
        isLicensed
      />,
    );
    assert.equal(screen.queryByRole('dialog'), null);
  });

  it('renders the dialog with the existing rule when open', () => {
    render(
      <TriggersDialog
        open
        onOpenChange={() => {}}
        triggers={rules}
        onSave={async () => {}}
        isLicensed
      />,
    );
    assert.ok(screen.getByRole('dialog'));
    const matchInputs = screen.getAllByPlaceholderText('tag:ACK level:error') as HTMLInputElement[];
    assert.equal(matchInputs[0]!.value, 'tag:ERROR');
  });

  it('Close button calls onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const onOpenChange = mock.fn();
    render(
      <TriggersDialog
        open
        onOpenChange={onOpenChange}
        triggers={rules}
        onSave={async () => {}}
        isLicensed
      />,
    );
    const closeButtons = screen.getAllByRole('button', { name: /^close$/i });
    // First match is the dialog X icon; second is the footer Close button.
    await user.click(closeButtons[closeButtons.length - 1]!);
    assert.ok(onOpenChange.mock.callCount() >= 1);
    assert.equal(onOpenChange.mock.calls[0]!.arguments[0], false);
  });
});
