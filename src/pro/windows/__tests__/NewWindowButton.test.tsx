// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NewWindowButton } from '../ui/NewWindowButton.js';
import { WindowsProvider } from '../context.js';
import { TabsProvider } from '../../tabs/context.js';
import { TooltipProvider } from '../../../components/ui/tooltip.js';

function Wrap() {
  return (
    <MemoryRouter>
      <WindowsProvider>
        <TabsProvider>
          <TooltipProvider>
            <NewWindowButton />
          </TooltipProvider>
        </TabsProvider>
      </WindowsProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
});

describe('NewWindowButton', () => {
  it('renders the Pro lock when multiwindow is not licensed (default)', () => {
    render(<Wrap />);
    // ProFeatureLock renders a button with label "New window" + tooltip text.
    const button = screen.getByRole('button', { name: /New window.*unlock/i });
    assert.ok(button);
  });
});
