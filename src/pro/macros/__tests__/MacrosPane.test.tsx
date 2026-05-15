// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MacrosPane } from '../ui/MacrosPane.js';
import { TabsProvider } from '../../tabs/context.js';
import { TooltipProvider } from '../../../components/ui/tooltip.js';

function Wrap({ isLicensed }: { isLicensed: boolean }) {
  return (
    <TabsProvider>
      <TooltipProvider>
        <MacrosPane isLicensed={isLicensed} />
      </TooltipProvider>
    </TabsProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('MacrosPane', () => {
  it('renders the Pro lock UI when isLicensed=false', () => {
    render(<Wrap isLicensed={false} />);
    assert.ok(screen.getByRole('button', { name: /Macros.*unlock/i }));
  });

  it('renders the empty pane with the New button when licensed and no macros', () => {
    render(<Wrap isLicensed />);
    assert.ok(screen.getByRole('button', { name: /new/i }));
    assert.ok(screen.getByText(/no macros yet/i));
  });

  it('exposes the Record button at the footer when licensed', () => {
    render(<Wrap isLicensed />);
    assert.ok(screen.getByRole('button', { name: /record/i }));
  });
});
