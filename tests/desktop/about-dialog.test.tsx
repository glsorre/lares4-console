import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

// Inject Vite-injected globals before any import of app-meta.
const G = globalThis as unknown as Record<string, unknown>;
G.__APP_NAME__ = 'lares4-console';
G.__APP_VERSION__ = '0.1.0';
G.__APP_REPO__ = 'https://github.com/glsorre/lares4-console';
G.__APP_AUTHOR__ = 'Giuseppe Lucio Sorrentino';

const React = await import('react');
const { cleanup, render, screen } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const { AboutDialog } = await import('../../src/desktop/components/AboutDialog.js');

afterEach(() => {
  cleanup();
});

describe('AboutDialog', () => {
  it('renders nothing when closed', () => {
    render(<AboutDialog open={false} onOpenChange={() => {}} />);
    assert.equal(screen.queryByRole('dialog'), null);
  });

  it('renders the app metadata and license tabs when open', () => {
    render(<AboutDialog open onOpenChange={() => {}} />);
    assert.ok(screen.getByText('Lares4 Console'));
    assert.ok(screen.getByText('v0.1.0'));
    assert.ok(screen.getByRole('tab', { name: /license/i }));
    assert.ok(screen.getByRole('tab', { name: /acknowledgements/i }));
    assert.ok(screen.getByRole('tab', { name: /updates/i }));
  });

  it('lists the license summary rows from app-meta', () => {
    render(<AboutDialog open onOpenChange={() => {}} />);
    const text = document.body.textContent ?? '';
    assert.match(text, /src\/core\/\*\*/);
    assert.match(text, /src\/pro\/\*\*/);
    assert.match(text, /PolyForm Noncommercial/);
  });

  it('switches to the Acknowledgements tab when clicked', async () => {
    const user = userEvent.setup();
    render(<AboutDialog open onOpenChange={() => {}} />);
    await user.click(screen.getByRole('tab', { name: /acknowledgements/i }));
    const ackTab = screen.getByRole('tab', { name: /acknowledgements/i });
    assert.equal(ackTab.getAttribute('aria-selected'), 'true');
  });

  it('invokes onOpenChange when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = mock.fn();
    render(<AboutDialog open onOpenChange={onOpenChange} />);
    const close = screen.getByRole('button', { name: /close/i });
    await user.click(close);
    assert.ok(onOpenChange.mock.callCount() >= 1);
    assert.equal(onOpenChange.mock.calls[0]!.arguments[0], false);
  });
});
