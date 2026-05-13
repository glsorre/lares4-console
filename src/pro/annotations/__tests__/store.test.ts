import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LogStore } from '../../../core/log-store.js';

describe('LogStore bookmarks', () => {
  it('toggle adds and removes bookmark', () => {
    const store = new LogStore();
    assert.equal(store.isBookmarked('g1'), false);
    assert.equal(store.toggleBookmark('g1'), true);
    assert.equal(store.isBookmarked('g1'), true);
    assert.equal(store.toggleBookmark('g1'), false);
    assert.equal(store.isBookmarked('g1'), false);
  });

  it('listBookmarks returns added entries in createdAt order', () => {
    const store = new LogStore();
    store.toggleBookmark('g1');
    store.toggleBookmark('g2', 'second');
    const list = store.listBookmarks();
    assert.equal(list.length, 2);
    assert.equal(list[0].groupId, 'g1');
    assert.equal(list[1].note, 'second');
  });

  it('setBookmarkNote updates note and clears when empty', () => {
    const store = new LogStore();
    store.toggleBookmark('g1');
    store.setBookmarkNote('g1', 'investigate');
    assert.equal(store.listBookmarks()[0].note, 'investigate');
    store.setBookmarkNote('g1', '');
    assert.equal(store.listBookmarks()[0].note, undefined);
  });

  it('clear removes bookmarks', () => {
    const store = new LogStore();
    store.toggleBookmark('g1');
    store.clear();
    assert.equal(store.isBookmarked('g1'), false);
    assert.equal(store.listBookmarks().length, 0);
  });

  it('bumps revision on bookmark changes', () => {
    const store = new LogStore();
    const v0 = store.version();
    store.toggleBookmark('g1');
    assert.notEqual(store.version(), v0);
  });
});
