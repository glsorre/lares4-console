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

  it('renders a summary row with the rule name and match preview', () => {
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
    assert.ok(screen.getByText('ack errors'));
    assert.ok(screen.getByText('tag:ERROR'));
  });

  it('duplicates a rule via the row actions menu and autosaves', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn<(next: TriggerRule[]) => Promise<void>>(async () => {});
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
    await user.click(screen.getByRole('button', { name: /rule actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /duplicate rule/i }));
    assert.ok(screen.getByText(/errors \(copy\)/i));
    const previews = screen.getAllByText('tag:ERROR');
    assert.equal(previews.length, 2);
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const saved = onSave.mock.calls[0]!.arguments[0];
    assert.equal(saved.length, 2);
  });

  it('confirms then deletes a rule via ⋮ → Delete and autosaves with it removed', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn<(next: TriggerRule[]) => Promise<void>>(async () => {});
    const rules: TriggerRule[] = [
      {
        id: 'r1',
        name: 'doomed',
        enabled: true,
        match: 'tag:ERROR',
        actions: [{ kind: 'highlight', color: 'red' }],
      },
      {
        id: 'r2',
        name: 'kept',
        enabled: true,
        match: 'tag:ACK',
        actions: [{ kind: 'highlight', color: 'amber' }],
      },
    ];
    render(<Wrap triggers={rules} onSave={onSave} />);
    const menuTriggers = screen.getAllByRole('button', { name: /rule actions/i });
    await user.click(menuTriggers[0]!);
    await user.click(screen.getByRole('menuitem', { name: /remove rule/i }));
    await waitFor(() => assert.ok(screen.getByText(/delete trigger rule\?/i)));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => assert.equal(screen.queryByText('doomed'), null));
    assert.ok(screen.getByText('kept'));
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const saved = onSave.mock.calls[0]!.arguments[0];
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.id, 'r2');
  });

  it('cancels deletion when Cancel is pressed in the confirmation dialog', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn<(next: TriggerRule[]) => Promise<void>>(async () => {});
    const rules: TriggerRule[] = [
      {
        id: 'r1',
        name: 'survivor',
        enabled: true,
        match: 'tag:ERROR',
        actions: [{ kind: 'highlight', color: 'red' }],
      },
    ];
    render(<Wrap triggers={rules} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: /rule actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /remove rule/i }));
    await waitFor(() => assert.ok(screen.getByText(/delete trigger rule\?/i)));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => assert.equal(screen.queryByText(/delete trigger rule\?/i), null));
    assert.ok(screen.getByText('survivor'));
    assert.equal(onSave.mock.callCount(), 0);
  });

  it('deletes the only rule via the confirmation dialog and the pane stays empty', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn<(next: TriggerRule[]) => Promise<void>>(async () => {});
    const rules: TriggerRule[] = [
      {
        id: 'r1',
        name: 'solo',
        enabled: true,
        match: 'tag:ERROR',
        actions: [{ kind: 'highlight', color: 'red' }],
      },
    ];
    render(<Wrap triggers={rules} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: /rule actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /remove rule/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => assert.equal(screen.queryByText('solo'), null));
    assert.equal(screen.queryByRole('button', { name: /save rules/i }), null);
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const saved = onSave.mock.calls[0]!.arguments[0];
    assert.equal(saved.length, 0);
  });

  it('disables the Test menu item when no audible action is configured', async () => {
    const user = userEvent.setup();
    const rules: TriggerRule[] = [
      {
        id: 'r1',
        name: 'r',
        enabled: true,
        match: 'tag:ERROR',
        actions: [{ kind: 'highlight', color: 'red' }],
      },
    ];
    render(<Wrap triggers={rules} />);
    await user.click(screen.getByRole('button', { name: /rule actions/i }));
    const testItem = screen.getByRole('menuitem', { name: /test rule/i });
    assert.equal(testItem.getAttribute('aria-disabled'), 'true');
  });

  it('opens the editor with Add rule and autosaves on dialog Save', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn<(next: TriggerRule[]) => Promise<void>>(async () => {});
    render(<Wrap onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: /add rule/i }));
    await user.type(screen.getByLabelText('Name'), 'My rule');
    const adv = screen.getByLabelText(/advanced/i) as HTMLInputElement;
    await user.type(adv, 'tag:ACK');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      assert.ok(screen.getByText('My rule'));
      assert.ok(screen.getByText('tag:ACK'));
    });
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const saved = onSave.mock.calls[0]!.arguments[0];
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.name, 'My rule');
    assert.equal(saved[0]!.match, 'tag:ACK');
  });

  it('autosaves when the enabled checkbox is toggled', async () => {
    const user = userEvent.setup();
    const onSave = mock.fn<(next: TriggerRule[]) => Promise<void>>(async () => {});
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
    await user.click(screen.getByRole('checkbox', { name: /enable rule/i }));
    await waitFor(() => assert.equal(onSave.mock.callCount(), 1));
    const saved = onSave.mock.calls[0]!.arguments[0];
    assert.equal(saved[0]!.enabled, false);
  });
});
