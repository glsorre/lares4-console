import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useAutocomplete } from '../../src/desktop/hooks/use-autocomplete.js';
import type { AutocompleteKeyResult, UseAutocompleteOptions } from '../../src/desktop/hooks/use-autocomplete.js';

type HarnessHandle = {
  current: ReturnType<typeof useAutocomplete> | null;
  lastResult: AutocompleteKeyResult | null;
};

function Harness({ handle, options }: { handle: HarnessHandle; options: UseAutocompleteOptions }) {
  const api = useAutocomplete(options);
  handle.current = api;
  return (
    <input
      data-testid="input"
      onKeyDown={(event) => {
        handle.lastResult = api.handleKeyDown(event);
      }}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe('useAutocomplete', () => {
  it('starts with activeIndex=-1 and clamps inside [0, itemCount) on ArrowDown', () => {
    const onPick = mock.fn();
    const handle: HarnessHandle = { current: null, lastResult: null };
    const { getByTestId } = render(
      <Harness handle={handle} options={{ itemCount: 3, open: true, onPick }} />,
    );
    assert.equal(handle.current?.activeIndex, -1);

    const input = getByTestId('input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    assert.equal(handle.lastResult, 'handled');
    assert.equal(handle.current?.activeIndex, 0);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    assert.equal(handle.current?.activeIndex, 2);
  });

  it('ArrowUp clamps at 0', () => {
    const handle: HarnessHandle = { current: null, lastResult: null };
    const { getByTestId } = render(
      <Harness handle={handle} options={{ itemCount: 3, open: true, onPick: () => {} }} />,
    );
    const input = getByTestId('input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    assert.equal(handle.current?.activeIndex, 0);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    assert.equal(handle.current?.activeIndex, 0);
  });

  it('Home jumps to first, End jumps to last', () => {
    const handle: HarnessHandle = { current: null, lastResult: null };
    const { getByTestId } = render(
      <Harness handle={handle} options={{ itemCount: 5, open: true, onPick: () => {} }} />,
    );
    const input = getByTestId('input');
    fireEvent.keyDown(input, { key: 'End' });
    assert.equal(handle.current?.activeIndex, 4);
    fireEvent.keyDown(input, { key: 'Home' });
    assert.equal(handle.current?.activeIndex, 0);
  });

  it('Tab triggers onPick with activeIndex (0 when no selection)', () => {
    const onPick = mock.fn();
    const handle: HarnessHandle = { current: null, lastResult: null };
    const { getByTestId } = render(
      <Harness handle={handle} options={{ itemCount: 3, open: true, onPick }} />,
    );
    fireEvent.keyDown(getByTestId('input'), { key: 'Tab' });
    assert.equal(onPick.mock.callCount(), 1);
    assert.equal(onPick.mock.calls[0]!.arguments[0], 0);
  });

  it('Escape calls onDismiss when open', () => {
    const onDismiss = mock.fn();
    const handle: HarnessHandle = { current: null, lastResult: null };
    const { getByTestId } = render(
      <Harness handle={handle} options={{ itemCount: 3, open: true, onPick: () => {}, onDismiss }} />,
    );
    fireEvent.keyDown(getByTestId('input'), { key: 'Escape' });
    assert.equal(onDismiss.mock.callCount(), 1);
  });

  it('returns fallthrough when closed', () => {
    const handle: HarnessHandle = { current: null, lastResult: null };
    const { getByTestId } = render(
      <Harness handle={handle} options={{ itemCount: 3, open: false, onPick: () => {} }} />,
    );
    fireEvent.keyDown(getByTestId('input'), { key: 'ArrowDown' });
    assert.equal(handle.lastResult, 'fallthrough');
    fireEvent.keyDown(getByTestId('input'), { key: 'Tab' });
    assert.equal(handle.lastResult, 'fallthrough');
  });

  it('pickActive calls onPick(0) when nothing is highlighted yet', () => {
    const onPick = mock.fn();
    const handle: HarnessHandle = { current: null, lastResult: null };
    render(<Harness handle={handle} options={{ itemCount: 3, open: true, onPick }} />);
    act(() => {
      handle.current?.pickActive();
    });
    assert.equal(onPick.mock.callCount(), 1);
    assert.equal(onPick.mock.calls[0]!.arguments[0], 0);
  });

  it('respects custom acceptKeys', () => {
    const onPick = mock.fn();
    const handle: HarnessHandle = { current: null, lastResult: null };
    const { getByTestId } = render(
      <Harness handle={handle} options={{ itemCount: 2, open: true, onPick, acceptKeys: ['Enter'] }} />,
    );
    fireEvent.keyDown(getByTestId('input'), { key: 'Tab' });
    assert.equal(onPick.mock.callCount(), 0);
    fireEvent.keyDown(getByTestId('input'), { key: 'Enter' });
    assert.equal(onPick.mock.callCount(), 1);
  });
});
