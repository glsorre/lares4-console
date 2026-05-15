import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const G = globalThis as unknown as Record<string, unknown>;
G.__APP_NAME__ = 'lares4-console';
G.__APP_VERSION__ = '0.1.0';
G.__APP_REPO__ = 'https://github.com/glsorre/lares4-console';
G.__APP_AUTHOR__ = 'Giuseppe Lucio Sorrentino';

const React = await import('react');
const { cleanup, render, screen } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const { MemoryRouter, Route, Routes } = await import('react-router-dom');
const { TabsProvider } = await import('../../src/pro/tabs/context.js');
const { WindowsProvider } = await import('../../src/pro/windows/context.js');
const { AppLayout } = await import('../../src/desktop/AppLayout.js');

interface MountOpts {
  initialEntries?: string[];
}

function mount({ initialEntries = ['/console'] }: MountOpts = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <WindowsProvider>
        <TabsProvider>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route path="console" element={<div data-testid="outlet">CONSOLE</div>} />
              <Route path="connect" element={<div data-testid="outlet">CONNECT</div>} />
            </Route>
          </Routes>
        </TabsProvider>
      </WindowsProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('AppLayout', () => {
  it('renders the app logo, connection chip, theme toggle, and skip link', () => {
    mount();
    assert.ok(screen.getByText('Lares4 Console'));
    assert.ok(screen.getByText('Skip to main content'));
    assert.ok(screen.getByRole('button', { name: /connection: idle/i }));
    assert.ok(screen.getByRole('button', { name: /theme/i }));
  });

  it('outlet content renders inside main with tabIndex=-1 and id="main-content"', () => {
    const { container } = mount();
    assert.ok(screen.getByTestId('outlet'));
    const main = container.querySelector('main#main-content');
    assert.ok(main);
    assert.equal(main!.getAttribute('tabIndex'), '-1');
  });

  it('connection chip toggles aria-pressed when clicked', async () => {
    const user = userEvent.setup();
    mount();
    const chip = screen.getByRole('button', { name: /connection:/i });
    const initial = chip.getAttribute('aria-pressed');
    await user.click(chip);
    assert.notEqual(chip.getAttribute('aria-pressed'), initial);
  });

  it('does not render the replay chip when replay is off (default)', () => {
    mount();
    assert.equal(screen.queryByLabelText(/^Replay:/), null);
  });

  it('renders the read-only and theme toggle controls', () => {
    mount();
    assert.ok(screen.getByRole('button', { name: /read-only mode/i }));
    assert.ok(screen.getByRole('button', { name: /theme:/i }));
  });
});
