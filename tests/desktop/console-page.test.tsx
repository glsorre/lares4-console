import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const G = globalThis as unknown as Record<string, unknown>;
G.__APP_NAME__ = 'lares4-console';
G.__APP_VERSION__ = '0.1.0';
G.__APP_REPO__ = 'https://github.com/glsorre/lares4-console';
G.__APP_AUTHOR__ = 'Giuseppe Lucio Sorrentino';

const React = await import('react');
const { useLayoutEffect } = React;
const { cleanup, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Outlet, Route, Routes } = await import('react-router-dom');
const { TabsProvider, useSessionController } = await import('../../src/pro/tabs/context.js');
const { WindowsProvider } = await import('../../src/pro/windows/context.js');
const { TooltipProvider } = await import('../../src/components/ui/tooltip.js');
const { ConsolePage } = await import('../../src/desktop/pages/ConsolePage.js');
import type { SessionController } from '../../src/desktop/runtime/session-controller.js';

interface ControllerStubs {
  clearLogs: ReturnType<typeof mock.fn>;
  submit: ReturnType<typeof mock.fn>;
  setOutputFormat: ReturnType<typeof mock.fn>;
  setCommandLine: ReturnType<typeof mock.fn>;
  historyUp: ReturnType<typeof mock.fn>;
  historyDown: ReturnType<typeof mock.fn>;
  listProfiles: ReturnType<typeof mock.fn>;
  setLogTagFilters: ReturnType<typeof mock.fn>;
  toggleBookmark: ReturnType<typeof mock.fn>;
}

function StubBootstrap({
  onReady,
}: {
  onReady: (controller: SessionController, stubs: ControllerStubs) => void;
}) {
  const { controller } = useSessionController();
  const installed = React.useRef(false);
  useLayoutEffect(() => {
    if (installed.current) return;
    installed.current = true;
    const stubs: ControllerStubs = {
      clearLogs: mock.fn(() => {}),
      submit: mock.fn(async () => {}),
      setOutputFormat: mock.fn(() => {}),
      setCommandLine: mock.fn(() => {}),
      historyUp: mock.fn(() => undefined),
      historyDown: mock.fn(() => undefined),
      listProfiles: mock.fn(async () => ({ profiles: [], defaultProfile: undefined })),
      setLogTagFilters: mock.fn(() => {}),
      toggleBookmark: mock.fn(() => {}),
    };
    Object.assign(controller, stubs);
    onReady(controller, stubs);
  }, [controller, onReady]);
  return null;
}

function ShellRoute() {
  const ctx = { sidebarOpen: false, toggleSidebar: () => {} };
  return <Outlet context={ctx} />;
}

interface Handle {
  controller: SessionController | null;
  stubs: ControllerStubs | null;
}

function mount(handle: Handle) {
  return render(
    <MemoryRouter initialEntries={['/console']}>
      <WindowsProvider>
        <TabsProvider>
          <TooltipProvider>
            <StubBootstrap
              onReady={(c, s) => {
                handle.controller = c;
                handle.stubs = s;
              }}
            />
            <Routes>
              <Route element={<ShellRoute />}>
                <Route path="/console" element={<ConsolePage />} />
              </Route>
            </Routes>
          </TooltipProvider>
        </TabsProvider>
      </WindowsProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('ConsolePage (smoke)', () => {
  it('renders top bar and logs empty state when disconnected', async () => {
    const handle: Handle = { controller: null, stubs: null };
    mount(handle);
    await waitFor(() => assert.ok(screen.queryByRole('button', { name: /open connections panel/i })));
    assert.ok(screen.getByRole('button', { name: /open connections panel/i }));
    assert.ok(screen.getByText('No messages yet'));
  });

  it('hides the CommandPane while disconnected', () => {
    const handle: Handle = { controller: null, stubs: null };
    mount(handle);
    assert.equal(screen.queryByLabelText('Command input'), null);
  });

  it('renders the Detail tabs strip', () => {
    const handle: Handle = { controller: null, stubs: null };
    mount(handle);
    assert.ok(screen.getByRole('tab', { name: /^detail$/i }));
    assert.ok(screen.getByRole('tab', { name: /^bookmarks/i }));
    assert.ok(screen.getByRole('tab', { name: /^triggers/i }));
    assert.ok(screen.getByRole('tab', { name: /^macros/i }));
  });

  it('replaces controller methods via the bootstrap stub', () => {
    const handle: Handle = { controller: null, stubs: null };
    mount(handle);
    assert.ok(handle.controller);
    assert.ok(handle.stubs);
    handle.controller!.clearLogs();
    assert.equal(handle.stubs!.clearLogs.mock.callCount(), 1);
  });
});
