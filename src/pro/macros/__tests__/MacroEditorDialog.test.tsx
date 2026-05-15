// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MacroEditorDialog } from '../ui/MacroEditorDialog.js';
import type { Macro } from '../types.js';

afterEach(() => {
  cleanup();
});

describe('MacroEditorDialog', () => {
  it('renders nothing when open is false', () => {
    render(
      <MacroEditorDialog open={false} onOpenChange={() => {}} onSave={async () => {}} />,
    );
    assert.equal(screen.queryByRole('dialog'), null);
  });

  it('renders title and disables Save when the name and steps are empty', () => {
    render(
      <MacroEditorDialog open onOpenChange={() => {}} onSave={async () => {}} />,
    );
    assert.ok(screen.getByText('New macro'));
    const save = screen.getByRole('button', { name: /^save$/i });
    assert.equal(save.hasAttribute('disabled'), true);
  });

  it('hydrates from initial macro when editing', () => {
    const initial: Macro = {
      id: 'm1',
      name: 'morning',
      description: 'turn things on',
      steps: [{ command: 'lights on 1' }, { command: 'covers up 1' }],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    render(
      <MacroEditorDialog open initial={initial} onOpenChange={() => {}} onSave={async () => {}} />,
    );
    assert.ok(screen.getByText('Edit macro'));
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    assert.equal(nameInput.value, 'morning');
    assert.match(screen.getByText(/2 steps/i).textContent ?? '', /2 steps/i);
  });

  it('invokes onSave then closes when Save is clicked with valid data', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn(async () => {});
    const onOpenChange = mock.fn();
    render(
      <MacroEditorDialog open onOpenChange={onOpenChange} onSave={onSave} />,
    );
    await user.type(screen.getByLabelText('Name'), 'demo');
    await user.type(screen.getByLabelText('Commands'), 'lights on 1');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const args = onSave.mock.calls[0]!.arguments as unknown as Array<{ name: string; steps: Array<{ command: string }> }>;
    const arg = args[0]!;
    assert.equal(arg.name, 'demo');
    assert.equal(arg.steps.length, 1);
    assert.equal(arg.steps[0]!.command, 'lights on 1');
    await waitFor(() => assert.equal(onOpenChange.mock.callCount(), 1));
    assert.equal(onOpenChange.mock.calls[0]!.arguments[0], false);
  });

  it('Cancel button closes the dialog without calling onSave', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn(async () => {});
    const onOpenChange = mock.fn();
    render(
      <MacroEditorDialog open onOpenChange={onOpenChange} onSave={onSave} />,
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    assert.equal(onSave.mock.callCount(), 0);
    assert.equal(onOpenChange.mock.callCount(), 1);
  });
});
