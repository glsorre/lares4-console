import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../../src/desktop/components/theme-toggle.js';

const STORAGE_KEY = 'lares4.theme';

let originalMatchMedia: typeof window.matchMedia | undefined;

function stubMatchMedia(prefersDark: boolean): void {
  originalMatchMedia = window.matchMedia;
  window.matchMedia = ((_query: string): MediaQueryList => ({
    matches: prefersDark,
    media: _query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  } as unknown as MediaQueryList)) as typeof window.matchMedia;
}

beforeEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
  document.documentElement.classList.remove('dark');
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  window.localStorage.removeItem(STORAGE_KEY);
  document.documentElement.classList.remove('dark');
});

describe('ThemeToggle', () => {
  it('defaults to system theme on first mount and persists it', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    assert.match(button.getAttribute('aria-label') ?? '', /system/i);
    assert.equal(window.localStorage.getItem(STORAGE_KEY), 'system');
  });

  it('reads the persisted theme on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark');
    render(<ThemeToggle />);
    assert.match(screen.getByRole('button').getAttribute('aria-label') ?? '', /dark/i);
    assert.ok(document.documentElement.classList.contains('dark'));
  });

  it('cycles light → dark → system on successive clicks', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, 'light');
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    assert.match(button.getAttribute('aria-label') ?? '', /light/i);

    await user.click(button);
    assert.match(button.getAttribute('aria-label') ?? '', /dark/i);
    assert.equal(window.localStorage.getItem(STORAGE_KEY), 'dark');
    assert.ok(document.documentElement.classList.contains('dark'));

    await user.click(button);
    assert.match(button.getAttribute('aria-label') ?? '', /system/i);
    assert.equal(window.localStorage.getItem(STORAGE_KEY), 'system');

    await user.click(button);
    assert.match(button.getAttribute('aria-label') ?? '', /light/i);
    assert.equal(window.localStorage.getItem(STORAGE_KEY), 'light');
    assert.equal(document.documentElement.classList.contains('dark'), false);
  });
});
