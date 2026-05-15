import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommercialLicenseDialog } from '../../src/desktop/components/CommercialLicenseDialog.js';
import { setBundleLicense, setFeatureLicense } from '../../src/desktop/runtime/commercial-license-prefs.js';

beforeEach(() => {
  // Reset persisted license state so the dialog starts from a clean slate.
  setBundleLicense(null);
  setFeatureLicense('macros', null);
});

afterEach(() => {
  cleanup();
  setBundleLicense(null);
  setFeatureLicense('macros', null);
});

describe('CommercialLicenseDialog', () => {
  it('renders nothing when open is false', () => {
    render(
      <CommercialLicenseDialog open={false} onOpenChange={() => {}} featureId="macros" />,
    );
    assert.equal(screen.queryByRole('dialog'), null);
  });

  it('renders the dialog with feature title and key input when open', () => {
    render(
      <CommercialLicenseDialog open onOpenChange={() => {}} featureId="macros" />,
    );
    assert.ok(screen.getByRole('dialog'));
    assert.ok(screen.getByLabelText('License key'));
    assert.ok(screen.getByRole('button', { name: /save/i }));
    assert.ok(screen.getByRole('button', { name: /cancel/i }));
  });

  it('disables Save when the key field is empty', () => {
    render(
      <CommercialLicenseDialog open onOpenChange={() => {}} featureId="macros" />,
    );
    const save = screen.getByRole('button', { name: /save/i });
    assert.equal(save.hasAttribute('disabled'), true);
  });

  it('Cancel button calls onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const onOpenChange = mock.fn();
    render(
      <CommercialLicenseDialog open onOpenChange={onOpenChange} featureId="macros" />,
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    assert.equal(onOpenChange.mock.callCount(), 1);
    assert.equal(onOpenChange.mock.calls[0]!.arguments[0], false);
  });
});
