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

  it('renders title and disables Save when the name is empty', () => {
    render(
      <MacroEditorDialog open onOpenChange={() => {}} onSave={async () => {}} />,
    );
    assert.ok(screen.getByText('New macro'));
    const save = screen.getByRole('button', { name: /^save$/i });
    assert.equal(save.hasAttribute('disabled'), true);
  });

  it('hydrates from initial macro with per-step rows and delays', () => {
    const initial: Macro = {
      id: 'm1',
      name: 'morning',
      description: 'turn things on',
      steps: [
        { command: 'lights on 1', delayMs: 500 },
        { command: 'covers up 1' },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    render(
      <MacroEditorDialog open initial={initial} onOpenChange={() => {}} onSave={async () => {}} />,
    );
    assert.ok(screen.getByText('Edit macro'));
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    assert.equal(nameInput.value, 'morning');
    const cmd0 = screen.getByLabelText('Step 1 command') as HTMLInputElement;
    const cmd1 = screen.getByLabelText('Step 2 command') as HTMLInputElement;
    assert.equal(cmd0.value, 'lights on 1');
    assert.equal(cmd1.value, 'covers up 1');
    const delay0 = screen.getByLabelText('Step 1 delay (ms)') as HTMLInputElement;
    const delay1 = screen.getByLabelText('Step 2 delay (ms)') as HTMLInputElement;
    assert.equal(delay0.value, '500');
    assert.equal(delay1.value, '');
    assert.match(screen.getByText(/2 steps/i).textContent ?? '', /2 steps/i);
  });

  it('invokes onSave with steps including delayMs when Save is clicked', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn(async () => {});
    const onOpenChange = mock.fn();
    render(
      <MacroEditorDialog open onOpenChange={onOpenChange} onSave={onSave} />,
    );
    await user.type(screen.getByLabelText('Name'), 'demo');
    await user.type(screen.getByLabelText('Step 1 command'), 'lights on 1');
    await user.type(screen.getByLabelText('Step 1 delay (ms)'), '750');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const args = onSave.mock.calls[0]!.arguments as unknown as Array<{
      name: string;
      steps: Array<{ command: string; delayMs?: number }>;
    }>;
    const arg = args[0]!;
    assert.equal(arg.name, 'demo');
    assert.equal(arg.steps.length, 1);
    assert.equal(arg.steps[0]!.command, 'lights on 1');
    assert.equal(arg.steps[0]!.delayMs, 750);
    await waitFor(() => assert.equal(onOpenChange.mock.callCount(), 1));
    assert.equal(onOpenChange.mock.calls[0]!.arguments[0], false);
  });

  it('omits delayMs when the delay field is left empty', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn(async () => {});
    render(
      <MacroEditorDialog open onOpenChange={() => {}} onSave={onSave} />,
    );
    await user.type(screen.getByLabelText('Name'), 'demo');
    await user.type(screen.getByLabelText('Step 1 command'), 'lights on 1');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const args = onSave.mock.calls[0]!.arguments as unknown as Array<{
      steps: Array<{ command: string; delayMs?: number }>;
    }>;
    assert.equal(args[0]!.steps[0]!.delayMs, undefined);
  });

  it('Add step appends a new row and Remove drops it', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn(async () => {});
    render(
      <MacroEditorDialog open onOpenChange={() => {}} onSave={onSave} />,
    );
    await user.type(screen.getByLabelText('Name'), 'demo');
    await user.type(screen.getByLabelText('Step 1 command'), 'a');
    await user.click(screen.getByRole('button', { name: /add step/i }));
    await user.type(screen.getByLabelText('Step 2 command'), 'b');
    assert.ok(screen.getByLabelText('Step 2 command'));
    await user.click(screen.getByRole('button', { name: /step 1 actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /remove step 1/i }));
    assert.equal(screen.queryByLabelText('Step 2 command'), null);
    const remaining = screen.getByLabelText('Step 1 command') as HTMLInputElement;
    assert.equal(remaining.value, 'b');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const args = onSave.mock.calls[0]!.arguments as unknown as Array<{
      steps: Array<{ command: string }>;
    }>;
    assert.equal(args[0]!.steps.length, 1);
    assert.equal(args[0]!.steps[0]!.command, 'b');
  });

  it('blocks Save when any step command is empty', async () => {
    const user = userEvent.setup();
    render(
      <MacroEditorDialog open onOpenChange={() => {}} onSave={async () => {}} />,
    );
    await user.type(screen.getByLabelText('Name'), 'demo');
    await user.click(screen.getByRole('button', { name: /add step/i }));
    await user.type(screen.getByLabelText('Step 1 command'), 'only-first');
    const save = screen.getByRole('button', { name: /^save$/i });
    assert.equal(save.hasAttribute('disabled'), true);
  });

  it('Move down reorders steps and Save persists new order', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn(async () => {});
    render(
      <MacroEditorDialog open onOpenChange={() => {}} onSave={onSave} />,
    );
    await user.type(screen.getByLabelText('Name'), 'demo');
    await user.type(screen.getByLabelText('Step 1 command'), 'a');
    await user.click(screen.getByRole('button', { name: /add step/i }));
    await user.type(screen.getByLabelText('Step 2 command'), 'b');
    await user.click(screen.getByRole('button', { name: /step 1 actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /move step 1 down/i }));
    const cmd0 = screen.getByLabelText('Step 1 command') as HTMLInputElement;
    const cmd1 = screen.getByLabelText('Step 2 command') as HTMLInputElement;
    assert.equal(cmd0.value, 'b');
    assert.equal(cmd1.value, 'a');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const args = onSave.mock.calls[0]!.arguments as unknown as Array<{
      steps: Array<{ command: string }>;
    }>;
    assert.equal(args[0]!.steps[0]!.command, 'b');
    assert.equal(args[0]!.steps[1]!.command, 'a');
  });

  it('Duplicate step inserts a copy directly after the source row', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn(async () => {});
    render(
      <MacroEditorDialog open onOpenChange={() => {}} onSave={onSave} />,
    );
    await user.type(screen.getByLabelText('Name'), 'demo');
    await user.type(screen.getByLabelText('Step 1 command'), 'a');
    await user.click(screen.getByRole('button', { name: /step 1 actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /duplicate step 1/i }));
    const cmd0 = screen.getByLabelText('Step 1 command') as HTMLInputElement;
    const cmd1 = screen.getByLabelText('Step 2 command') as HTMLInputElement;
    assert.equal(cmd0.value, 'a');
    assert.equal(cmd1.value, 'a');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const args = onSave.mock.calls[0]!.arguments as unknown as Array<{
      steps: Array<{ command: string }>;
    }>;
    assert.equal(args[0]!.steps.length, 2);
  });

  it('Enter on a filled last-step command appends a new empty step', async () => {
    const user = userEvent.setup();
    render(
      <MacroEditorDialog open onOpenChange={() => {}} onSave={async () => {}} />,
    );
    await user.type(screen.getByLabelText('Name'), 'demo');
    const cmd0 = screen.getByLabelText('Step 1 command') as HTMLInputElement;
    await user.type(cmd0, 'a');
    await user.keyboard('{Enter}');
    assert.ok(screen.getByLabelText('Step 2 command'));
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
