import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applySuggestion } from '../src/desktop/components/command-pane-apply.js';
import { applyCompletion } from '../src/core/autocomplete.js';

describe('applySuggestion', () => {
  it('returns applyCompletion result for an in-range index', () => {
    const suggestions = ['format', 'follow', 'help'];
    const next = applySuggestion('fo', suggestions, 0);
    assert.equal(next, applyCompletion('fo', 'format'));
    assert.equal(next, 'format ');
  });

  it('handles a later index in the suggestions list', () => {
    const suggestions = ['format', 'follow', 'help'];
    const next = applySuggestion('fo', suggestions, 1);
    assert.equal(next, 'follow ');
  });

  it('returns null for an out-of-range index', () => {
    const suggestions = ['format', 'follow'];
    assert.equal(applySuggestion('fo', suggestions, 5), null);
    assert.equal(applySuggestion('fo', suggestions, -1), null);
  });

  it('returns null when suggestions list is empty', () => {
    assert.equal(applySuggestion('anything', [], 0), null);
  });
});
