import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getLogPaneRowCount } from '../src/core/log-view.js';

const originalRowsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'rows');

function setStdoutRows(value: number): void {
  Object.defineProperty(process.stdout, 'rows', {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

afterEach(() => {
  if (originalRowsDescriptor) {
    Object.defineProperty(process.stdout, 'rows', originalRowsDescriptor);
  }
});

describe('log pane row count', () => {
  it('reduces viewport when extra chrome rows are provided', () => {
    setStdoutRows(40);
    const base = getLogPaneRowCount();
    const withExtra = getLogPaneRowCount({ extraChromeRows: 4 });
    assert.equal(base, 32);
    assert.equal(withExtra, 28);
  });

  it('enforces minimum pane rows', () => {
    setStdoutRows(10);
    assert.equal(getLogPaneRowCount({ extraChromeRows: 99 }), 8);
  });
});

