import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProFeatureLock } from '../../src/desktop/components/ProFeatureLock.js';
import { TooltipProvider } from '../../src/components/ui/tooltip.js';

afterEach(() => {
  cleanup();
});

describe('ProFeatureLock', () => {
  it('renders an interactive lock button with the feature label by default', () => {
    render(
      <TooltipProvider>
        <ProFeatureLock featureId="macros" label="Macros" />
      </TooltipProvider>,
    );
    const button = screen.getByRole('button', { name: /Macros/i });
    assert.ok(button);
  });

  it('renders the pane variant via FeatureGateEmptyState', () => {
    render(
      <TooltipProvider>
        <ProFeatureLock featureId="triggers" label="Triggers locked" variant="pane" paneDescription="More info." />
      </TooltipProvider>,
    );
    assert.ok(screen.getByText('Triggers locked'));
    assert.ok(screen.getByText('More info.'));
    assert.ok(screen.getByRole('button', { name: /unlock/i }));
  });

  it('renders a non-interactive decoration when asDecoration is set', () => {
    render(
      <TooltipProvider>
        <ProFeatureLock featureId="tabs" label="Tabs" asDecoration />
      </TooltipProvider>,
    );
    assert.equal(screen.queryByRole('button', { name: /Tabs/i }), null);
  });

  it('opens the license dialog when the inline lock is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ProFeatureLock featureId="macros" label="Macros" />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole('button', { name: /Macros/i }));
    // The dialog title text exposes the open state of CommercialLicenseDialog.
    assert.ok(screen.queryByRole('dialog'));
  });
});
