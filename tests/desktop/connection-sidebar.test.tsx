import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React, { useLayoutEffect, useRef } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabsProvider, useSessionController } from '../../src/pro/tabs/context.js';
import { TooltipProvider } from '../../src/components/ui/tooltip.js';
import { ConnectionSidebar } from '../../src/desktop/components/ConnectionSidebar.js';
import type { SessionController } from '../../src/desktop/runtime/session-controller.js';

interface ProfileFixture {
  name: string;
  ip: string;
  pin: string;
  wss: boolean;
  sender: string;
  readOnly?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ControllerSpies {
  connect: ReturnType<typeof mock.fn>;
  disconnect: ReturnType<typeof mock.fn>;
  saveProfile: ReturnType<typeof mock.fn>;
  removeProfile: ReturnType<typeof mock.fn>;
  setDefaultProfileName: ReturnType<typeof mock.fn>;
  listProfiles: ReturnType<typeof mock.fn>;
}

function patchController(
  controller: SessionController,
  profiles: ProfileFixture[],
  defaultProfile: string | undefined,
): ControllerSpies {
  const spies: ControllerSpies = {
    connect: mock.fn(async () => {}),
    disconnect: mock.fn(() => {}),
    saveProfile: mock.fn(async () => {}),
    removeProfile: mock.fn(async () => {}),
    setDefaultProfileName: mock.fn(async () => {}),
    listProfiles: mock.fn(async () => ({ profiles, defaultProfile })),
  };
  Object.assign(controller, {
    connect: spies.connect,
    disconnect: spies.disconnect,
    saveProfile: spies.saveProfile,
    removeProfile: spies.removeProfile,
    setDefaultProfileName: spies.setDefaultProfileName,
    listProfiles: spies.listProfiles,
  });
  return spies;
}

function StubBootstrap({
  profiles,
  defaultProfile,
  onReady,
}: {
  profiles: ProfileFixture[];
  defaultProfile?: string;
  onReady: (controller: SessionController, spies: ControllerSpies) => void;
}) {
  const { controller } = useSessionController();
  const installed = useRef(false);
  useLayoutEffect(() => {
    if (installed.current) return;
    installed.current = true;
    const spies = patchController(controller, profiles, defaultProfile);
    onReady(controller, spies);
  }, [controller, profiles, defaultProfile, onReady]);
  return null;
}

interface HarnessHandle {
  controller: SessionController | null;
  spies: ControllerSpies | null;
}

function makeHarness(handle: HarnessHandle, profiles: ProfileFixture[], defaultProfile?: string) {
  return (
    <TabsProvider>
      <StubBootstrap
        profiles={profiles}
        defaultProfile={defaultProfile}
        onReady={(controller, spies) => {
          handle.controller = controller;
          handle.spies = spies;
        }}
      />
      <TooltipProvider>
        <ConnectionSidebar />
      </TooltipProvider>
    </TabsProvider>
  );
}

const sampleProfiles: ProfileFixture[] = [
  {
    name: 'home',
    ip: '192.168.1.10',
    pin: '1234',
    wss: true,
    sender: 'lares4 console',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    name: 'office',
    ip: '10.0.0.10',
    pin: '5678',
    wss: false,
    sender: 'lares4 console',
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  },
];

afterEach(() => {
  cleanup();
});

describe('ConnectionSidebar', () => {
  it('lists saved profiles and the default star marker', async () => {
    const handle: HarnessHandle = { controller: null, spies: null };
    render(makeHarness(handle, sampleProfiles, 'home'));
    await waitFor(() => assert.ok(screen.queryByText('home')));
    assert.ok(screen.getByText('home'));
    assert.ok(screen.getByText('office'));
    assert.ok(screen.getByLabelText('Default profile'));
  });

  it('clicking Connect on a profile calls controller.connect with profile fields', async () => {
    const user = userEvent.setup();
    const handle: HarnessHandle = { controller: null, spies: null };
    render(makeHarness(handle, sampleProfiles, 'home'));
    await waitFor(() => assert.ok(screen.queryByText('home')));
    const connectButtons = screen.getAllByRole('button', { name: /^connect$/i });
    await user.click(connectButtons[0]!);
    assert.equal(handle.spies?.connect.mock.callCount(), 1);
    const arg = handle.spies?.connect.mock.calls[0]!.arguments[0] as Record<string, unknown>;
    assert.equal(arg.ip, '192.168.1.10');
    assert.equal(arg.pin, '1234');
    assert.equal(arg.profileName, 'home');
  });

  it('switches to the form view when there are no profiles', async () => {
    const handle: HarnessHandle = { controller: null, spies: null };
    render(makeHarness(handle, [], undefined));
    await waitFor(() => assert.ok(screen.queryByLabelText('IP / host')));
    assert.ok(screen.getByLabelText('IP / host'));
    assert.ok(screen.getByLabelText('PIN'));
  });

  it('opens the delete confirmation dialog and removes a profile on Remove', async () => {
    const user = userEvent.setup();
    const handle: HarnessHandle = { controller: null, spies: null };
    render(makeHarness(handle, sampleProfiles, 'home'));
    await waitFor(() => assert.ok(screen.queryByText('office')));
    // Open per-row options menu, then choose Delete.
    await user.click(screen.getByRole('button', { name: 'Options for office' }));
    await user.click(screen.getByRole('menuitem', { name: /^delete$/i }));
    // Dialog appears.
    assert.ok(screen.getByText('Remove profile?'));
    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() => assert.equal(handle.spies?.removeProfile.mock.callCount(), 1));
    assert.equal(handle.spies?.removeProfile.mock.calls[0]!.arguments[0], 'office');
  });

  it('Set as default invokes controller.setDefaultProfileName', async () => {
    const user = userEvent.setup();
    const handle: HarnessHandle = { controller: null, spies: null };
    render(makeHarness(handle, sampleProfiles, 'home'));
    await waitFor(() => assert.ok(screen.queryByText('office')));
    await user.click(screen.getByRole('button', { name: 'Options for office' }));
    await user.click(screen.getByRole('menuitem', { name: /set as default/i }));
    await waitFor(() => assert.equal(handle.spies?.setDefaultProfileName.mock.callCount(), 1));
    assert.equal(handle.spies?.setDefaultProfileName.mock.calls[0]!.arguments[0], 'office');
  });
});

// Silence the unused-import lint when act is not directly used.
void act;
