import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../../src/desktop/components/ErrorBoundary.js';
import { i18n } from '../../src/i18n/index.js';

function Boom(): React.ReactElement {
  throw new Error('boom');
}

afterEach(() => {
  cleanup();
});

describe('ErrorBoundary', () => {
  it('renders the English fallback after a child throws', async () => {
    await i18n.changeLanguage('en');
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    assert.match(document.body.textContent ?? '', /something went wrong/i);
    assert.ok(screen.getByRole('button', { name: /reload window/i }));
    assert.ok(screen.getByRole('button', { name: /copy stack/i }));
  });

  it('renders the Italian fallback after changeLanguage(it)', async () => {
    await i18n.changeLanguage('it');
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    assert.match(document.body.textContent ?? '', /si è verificato un errore/i);
    assert.ok(screen.getByRole('button', { name: /ricarica finestra/i }));
    assert.ok(screen.getByRole('button', { name: /copia stack/i }));
    await i18n.changeLanguage('en');
  });

  it('passes children through when no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">child</div>
      </ErrorBoundary>,
    );
    assert.ok(screen.getByTestId('child'));
  });
});
