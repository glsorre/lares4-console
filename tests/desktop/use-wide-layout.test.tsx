import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { useWideLayout } from '../../src/desktop/hooks/use-wide-layout.js';

type MockMQL = MediaQueryList & {
  setMatches: (value: boolean) => void;
  listeners: Set<(event: MediaQueryListEvent) => void>;
};

let currentMatches = true;
let sharedMql: MockMQL | null = null;
let originalMatchMedia: typeof window.matchMedia | undefined;

function installMatchMedia(initial: boolean): void {
  currentMatches = initial;
  originalMatchMedia = window.matchMedia;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  // Share one MQL across all matchMedia() calls so listeners registered via subscribe
  // see the same set that setMatches dispatches to.
  const mql: Partial<MockMQL> = {
    get matches() {
      return currentMatches;
    },
    onchange: null,
    addEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
      listeners.add(cb as (event: MediaQueryListEvent) => void);
    },
    removeEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
      listeners.delete(cb as (event: MediaQueryListEvent) => void);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
    listeners,
    setMatches: (value: boolean) => {
      currentMatches = value;
      for (const cb of listeners) {
        cb({ matches: value, media: '(min-width: 768px)' } as MediaQueryListEvent);
      }
    },
  };
  sharedMql = mql as MockMQL;
  window.matchMedia = ((query: string): MediaQueryList => {
    (mql as MockMQL & { media?: string }).media = query;
    return mql as MockMQL;
  }) as typeof window.matchMedia;
}

function Probe({ onValue }: { onValue: (v: boolean) => void }) {
  const wide = useWideLayout();
  onValue(wide);
  return <div data-testid="probe">{String(wide)}</div>;
}

beforeEach(() => {
  installMatchMedia(true);
});

afterEach(() => {
  cleanup();
  if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  sharedMql = null;
});

describe('useWideLayout', () => {
  it('returns initial matchMedia value', () => {
    let captured: boolean | null = null;
    render(<Probe onValue={(v) => { captured = v; }} />);
    assert.equal(captured, true);
  });

  it('re-renders when the media query toggles', () => {
    const values: boolean[] = [];
    render(<Probe onValue={(v) => values.push(v)} />);
    assert.equal(values[values.length - 1], true);
    act(() => {
      sharedMql?.setMatches(false);
    });
    assert.equal(values[values.length - 1], false);
    act(() => {
      sharedMql?.setMatches(true);
    });
    assert.equal(values[values.length - 1], true);
  });

  it('starts false when matchMedia reports false', () => {
    if (originalMatchMedia) window.matchMedia = originalMatchMedia;
    installMatchMedia(false);
    let captured: boolean | null = null;
    render(<Probe onValue={(v) => { captured = v; }} />);
    assert.equal(captured, false);
  });
});
