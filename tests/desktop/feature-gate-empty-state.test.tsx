import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeatureGateEmptyState } from '../../src/desktop/components/FeatureGateEmptyState.js';

afterEach(() => {
  cleanup();
});

describe('FeatureGateEmptyState', () => {
  it('renders title, description, and Unlock CTA', () => {
    render(
      <FeatureGateEmptyState
        featureId="macros"
        title="Macros locked"
        description="Buy a license to use macros."
        onUnlock={() => {}}
      />,
    );
    assert.ok(screen.getByText('Macros locked'));
    assert.ok(screen.getByText('Buy a license to use macros.'));
    assert.ok(screen.getByRole('button', { name: /unlock/i }));
  });

  it('exposes the featureId via data attribute', () => {
    const { container } = render(
      <FeatureGateEmptyState
        featureId="triggers"
        title="t"
        description="d"
        onUnlock={() => {}}
      />,
    );
    const root = container.querySelector('[data-feature]');
    assert.ok(root);
    assert.equal(root!.getAttribute('data-feature'), 'triggers');
  });

  it('invokes onUnlock when the CTA is clicked', async () => {
    const user = userEvent.setup();
    const onUnlock = mock.fn();
    render(
      <FeatureGateEmptyState
        featureId="macros"
        title="t"
        description="d"
        onUnlock={onUnlock}
      />,
    );
    await user.click(screen.getByRole('button', { name: /unlock/i }));
    assert.equal(onUnlock.mock.callCount(), 1);
  });
});
