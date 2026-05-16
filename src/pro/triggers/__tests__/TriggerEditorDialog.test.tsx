// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in ../LICENSE.

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriggerEditorDialog } from '../ui/TriggerEditorDialog.js';
import { TooltipProvider } from '../../../components/ui/tooltip.js';
import type { TriggerRule } from '../engine.js';

function Wrap(props: {
  open?: boolean;
  initial?: TriggerRule;
  onSave?: (rule: TriggerRule) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <TooltipProvider>
      <TriggerEditorDialog
        open={props.open ?? true}
        initial={props.initial}
        onSave={props.onSave ?? (() => {})}
        onOpenChange={props.onOpenChange ?? (() => {})}
      />
    </TooltipProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('TriggerEditorDialog', () => {
  it('hydrates from an existing rule and shows the match preview', () => {
    const rule: TriggerRule = {
      id: 'r1',
      name: 'my rule',
      enabled: true,
      match: 'tag:ERROR cmd:LIGHTS foo',
      actions: [{ kind: 'highlight', color: 'red' }],
    };
    render(<Wrap initial={rule} />);
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    assert.equal(nameInput.value, 'my rule');
    const adv = screen.getByLabelText(/advanced/i) as HTMLInputElement;
    assert.equal(adv.value, 'foo');
    assert.ok(screen.getByText('tag:ERROR cmd:LIGHTS foo'));
  });

  it('saves a rule with the rebuilt match string', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn<(r: TriggerRule) => void>();
    render(<Wrap onSave={onSave} />);
    await user.type(screen.getByLabelText('Name'), 'r1');
    const adv = screen.getByLabelText(/advanced/i) as HTMLInputElement;
    await user.type(adv, 'tag:ACK');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const arg = onSave.mock.calls[0]!.arguments[0]!;
    assert.equal(arg.name, 'r1');
    assert.equal(arg.match, 'tag:ACK');
    assert.ok(arg.actions.some((a) => a.kind === 'highlight'));
  });

  it('toggles raw DSL mode and preserves the match string', async () => {
    const user = userEvent.setup();
    const rule: TriggerRule = {
      id: 'r1',
      name: 'r',
      enabled: true,
      match: 'tag:ERROR',
      actions: [{ kind: 'beep' }],
    };
    render(<Wrap initial={rule} />);
    await user.click(screen.getByRole('button', { name: /edit as raw dsl/i }));
    const textarea = screen.getByPlaceholderText('tag:ACK level:error') as HTMLTextAreaElement;
    assert.equal(textarea.value, 'tag:ERROR');
  });

  it('disables the structured toggle when raw DSL has an error', async () => {
    const user = userEvent.setup();
    render(<Wrap />);
    await user.click(screen.getByRole('button', { name: /edit as raw dsl/i }));
    const textarea = screen.getByPlaceholderText('tag:ACK level:error') as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, 'tag:NOPE');
    const toggle = screen.getByRole('button', { name: /use structured editor/i }) as HTMLButtonElement;
    assert.equal(toggle.disabled, true);
  });

  it('does not call onSave when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn<(r: TriggerRule) => void>();
    const onOpenChange = mock.fn<(open: boolean) => void>();
    render(<Wrap onSave={onSave} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    assert.equal(onSave.mock.callCount(), 0);
    assert.equal(onOpenChange.mock.callCount(), 1);
    assert.equal(onOpenChange.mock.calls[0]!.arguments[0], false);
  });
});
