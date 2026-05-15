import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { usePaneWidth } from '../../src/desktop/hooks/use-pane-width.js';

type ResizeCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

let activeCallback: ResizeCallback | null = null;
let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;

class FakeResizeObserver implements ResizeObserver {
  constructor(cb: ResizeCallback) {
    activeCallback = cb;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    activeCallback = null;
  }
}

function Probe() {
  const { ref, width } = usePaneWidth<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="pane" data-width={width}>
      {width}
    </div>
  );
}

let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect | undefined;

function stubBoundingRectWidth(width: number): void {
  originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
}

function restoreBoundingRect(): void {
  if (originalGetBoundingClientRect) {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    originalGetBoundingClientRect = undefined;
  }
}

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  (globalThis as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver = FakeResizeObserver;
});

afterEach(() => {
  cleanup();
  activeCallback = null;
  if (originalResizeObserver) globalThis.ResizeObserver = originalResizeObserver;
  restoreBoundingRect();
});

describe('usePaneWidth', () => {
  it('returns 0 before any measurement when bounding rect reports 0', () => {
    const { getByTestId } = render(<Probe />);
    assert.equal(getByTestId('pane').getAttribute('data-width'), '0');
  });

  it('seeds width from getBoundingClientRect on mount', () => {
    stubBoundingRectWidth(420);
    const { getByTestId } = render(<Probe />);
    assert.equal(getByTestId('pane').getAttribute('data-width'), '420');
  });

  it('updates width when ResizeObserver fires', () => {
    const { getByTestId } = render(<Probe />);
    assert.ok(activeCallback, 'observer callback should be registered');
    act(() => {
      activeCallback!(
        [{ contentRect: { width: 768 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    assert.equal(getByTestId('pane').getAttribute('data-width'), '768');
    act(() => {
      activeCallback!(
        [{ contentRect: { width: 1024 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    assert.equal(getByTestId('pane').getAttribute('data-width'), '1024');
  });

  it('ignores empty entry arrays', () => {
    stubBoundingRectWidth(300);
    const { getByTestId } = render(<Probe />);
    const before = getByTestId('pane').getAttribute('data-width');
    act(() => {
      activeCallback!([], {} as ResizeObserver);
    });
    assert.equal(getByTestId('pane').getAttribute('data-width'), before);
  });
});
