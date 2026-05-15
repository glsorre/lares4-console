import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateBanner } from '../../src/desktop/components/UpdateBanner.js';
import type { UpdaterState } from '../../src/desktop/runtime/updater.js';

afterEach(() => {
  cleanup();
});

describe('UpdateBanner', () => {
  it('renders nothing when phase is idle', () => {
    const { container } = render(
      <UpdateBanner state={{ phase: 'idle' }} onInstall={() => {}} onDismiss={() => {}} />,
    );
    assert.equal(container.textContent, '');
  });

  it('renders title, version, install, and dismiss in the available phase', async () => {
    const user = userEvent.setup();
    const onInstall = mock.fn();
    const onDismiss = mock.fn();
    const state: UpdaterState = {
      phase: 'available',
      info: { version: '1.2.3', body: 'Cool stuff.' } as UpdaterState extends { phase: 'available'; info: infer I } ? I : never,
    };
    render(<UpdateBanner state={state} onInstall={onInstall} onDismiss={onDismiss} />);
    assert.ok(screen.getByText(/v1\.2\.3/));
    assert.ok(screen.getByText('Cool stuff.'));
    await user.click(screen.getByRole('button', { name: /install & restart/i }));
    assert.equal(onInstall.mock.callCount(), 1);
    await user.click(screen.getByRole('button', { name: /dismiss update/i }));
    assert.equal(onDismiss.mock.callCount(), 1);
  });

  it('renders bytes and percentage during installing', () => {
    render(
      <UpdateBanner
        state={{ phase: 'installing', downloaded: 512 * 1024, total: 1024 * 1024 }}
        onInstall={() => {}}
        onDismiss={() => {}}
      />,
    );
    assert.ok(screen.getByText(/Downloading update/i));
    assert.ok(screen.getByText(/512\.0 KB/));
    assert.ok(screen.getByText(/1\.0 MB/));
    assert.ok(screen.getByText(/50%/));
  });

  it('omits percentage when total is missing', () => {
    render(
      <UpdateBanner
        state={{ phase: 'installing', downloaded: 200 }}
        onInstall={() => {}}
        onDismiss={() => {}}
      />,
    );
    assert.ok(screen.getByText(/200 B/));
    assert.equal(screen.queryByText(/%/), null);
  });
});
