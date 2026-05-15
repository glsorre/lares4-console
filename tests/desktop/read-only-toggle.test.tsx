import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadOnlyToggle } from '../../src/desktop/components/ReadOnlyToggle.js';
import { isReadOnlyMode, setReadOnlyMode } from '../../src/desktop/runtime/read-only-prefs.js';

beforeEach(() => {
  setReadOnlyMode(false);
});

afterEach(() => {
  cleanup();
  setReadOnlyMode(false);
});

describe('ReadOnlyToggle', () => {
  it('reflects the initial read-only state as aria-pressed=false', () => {
    render(<ReadOnlyToggle />);
    assert.equal(screen.getByRole('button').getAttribute('aria-pressed'), 'false');
  });

  it('reflects an initial enabled state when prefs are already true', () => {
    setReadOnlyMode(true);
    render(<ReadOnlyToggle />);
    assert.equal(screen.getByRole('button').getAttribute('aria-pressed'), 'true');
  });

  it('toggles the underlying preference on click', async () => {
    const user = userEvent.setup();
    render(<ReadOnlyToggle />);
    const button = screen.getByRole('button');
    await user.click(button);
    assert.equal(isReadOnlyMode(), true);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    await user.click(button);
    assert.equal(isReadOnlyMode(), false);
    assert.equal(button.getAttribute('aria-pressed'), 'false');
  });
});
