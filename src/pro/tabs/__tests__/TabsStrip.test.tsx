// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getPublicKeyAsync, signAsync } from '@noble/ed25519';
import { TabsStrip } from '../ui/TabsStrip.js';
import { TabsProvider } from '../context.js';
import { TooltipProvider } from '../../../components/ui/tooltip.js';
import {
  verifyAndSaveFeatureLicense,
  __resetTokenStoreForTests,
} from '@/desktop/runtime/commercial-license-prefs.js';
import { __clearVerifyCacheForTests } from '@/desktop/runtime/license-verify.js';
import { installFakeTransport } from '../../../../tests/helpers/fake-license-transport.js';

const PRIV = new Uint8Array(32);
const PUB_HEX_PROMISE = getPublicKeyAsync(PRIV).then((p) =>
  Array.from(p, (b) => b.toString(16).padStart(2, '0')).join(''),
);

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/=+$/u, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function mintTabsToken(): Promise<string> {
  const payload = { v: 1, f: 'tabs', sub: 'test@example.com', iat: Math.floor(Date.now() / 1000) };
  const payloadEnc = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await signAsync(new TextEncoder().encode(payloadEnc), PRIV);
  return `LARES4-${payloadEnc}.${base64UrlEncode(sig)}`;
}

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

  it('unlocks the New tab button when a license-change broadcast fires (no manual dialog)', async () => {
    // Reproduces the bug: a valid license arriving asynchronously (e.g. bootstrap
    // finishing) must unlock the button via the license-change broadcast, without
    // the user opening the dialog.
    __clearVerifyCacheForTests();
    __resetTokenStoreForTests();
    const pubHex = await PUB_HEX_PROMISE;
    installFakeTransport({ pubkeysHex: [pubHex] });
    const user = userEvent.setup();
    try {
      render(<Wrap />);
      // Starts locked: one tab, no second-tab capability.
      assert.equal(screen.getAllByRole('tab').length, 1);

      // License becomes valid and broadcasts a change (mirrors async bootstrap).
      const token = await mintTabsToken();
      await act(async () => {
        await verifyAndSaveFeatureLicense('tabs', token);
      });

      // Button is now the real action, not the lock: clicking adds a tab and
      // does NOT open the license dialog.
      await user.click(screen.getByRole('button', { name: /new tab/i }));
      assert.equal(screen.queryByRole('dialog'), null, 'unlocked button must not open the license dialog');
      assert.equal(screen.getAllByRole('tab').length, 2, 'clicking the unlocked button adds a tab');
    } finally {
      __resetTokenStoreForTests();
      __clearVerifyCacheForTests();
    }
  });
});
