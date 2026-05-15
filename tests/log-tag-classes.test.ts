import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getTagClasses, getTagDotClass } from '../src/desktop/runtime/log-tag-classes.js';
import type { LogTag } from '../src/core/types.js';

const TAGS: LogTag[] = ['ACK', 'CHANGE', 'ERROR', 'LOG', 'SYSTEM', 'RAW_RX', 'BULK', 'RAW_TX'];

describe('log tag classes', () => {
  it('returns a distinct dot class for every known tag', () => {
    const seen = new Set<string>();
    for (const tag of TAGS) {
      const cls = getTagDotClass(tag);
      assert.notEqual(cls, '');
      assert.ok(cls.startsWith('bg-'), `expected bg- class for ${tag}, got ${cls}`);
      seen.add(cls);
    }
    assert.equal(seen.size, TAGS.length);
  });

  it('returns a distinct tag class pair (bg + text) for every known tag', () => {
    for (const tag of TAGS) {
      const cls = getTagClasses(tag);
      assert.match(cls, /bg-\S+/);
      assert.match(cls, /text-\S+/);
      assert.match(cls, /dark:bg-\S+/);
      assert.match(cls, /dark:text-\S+/);
    }
  });

  it('falls back to muted classes for unknown tags', () => {
    const dot = getTagDotClass('UNKNOWN' as LogTag);
    const full = getTagClasses('UNKNOWN' as LogTag);
    assert.equal(dot, 'bg-muted-foreground');
    assert.equal(full, 'bg-muted text-muted-foreground');
  });
});
