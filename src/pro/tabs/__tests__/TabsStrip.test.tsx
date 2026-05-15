// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabsStrip } from '../ui/TabsStrip.js';
import { TabsProvider } from '../context.js';
import { TooltipProvider } from '../../../components/ui/tooltip.js';

function Wrap() {
  return (
    <TabsProvider>
      <TooltipProvider>
        <TabsStrip />
      </TooltipProvider>
    </TabsProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('TabsStrip', () => {
  it('renders the tablist with a single tab and a New tab button', () => {
    render(<Wrap />);
    assert.ok(screen.getByRole('tablist', { name: /connection tabs/i }));
    const tabs = screen.getAllByRole('tab');
    assert.equal(tabs.length, 1);
    assert.match(tabs[0]!.textContent ?? '', /Tab 1/);
    assert.ok(screen.getByRole('button', { name: /new tab/i }));
  });

  it('marks the single tab as selected and omits a close control', () => {
    render(<Wrap />);
    const tab = screen.getByRole('tab');
    assert.equal(tab.getAttribute('aria-selected'), 'true');
    assert.equal(screen.queryByRole('button', { name: /^close Tab/i }), null);
  });

  it('clicking the unlicensed New tab control opens the Pro license dialog', async () => {
    // MAX_FREE_TABS = 1 + tabs feature unlicensed in this test → New tab renders as ProFeatureLock.
    const user = userEvent.setup();
    render(<Wrap />);
    await user.click(screen.getByRole('button', { name: /new tab/i }));
    assert.ok(screen.getByRole('dialog'));
  });
});
