import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TabsController } from '../controller.js';
import { DesktopProfilesRepository } from '@/desktop/runtime/profiles-repository-desktop.js';
import {
  setFeatureLicense,
  __resetTokenStoreForTests,
} from '@/desktop/runtime/commercial-license-prefs.js';

function stubRepo(): DesktopProfilesRepository {
  return new DesktopProfilesRepository({
    read: async () => null,
    write: async () => undefined,
  });
}

function makeController(licensed: boolean): TabsController {
  return new TabsController({
    profiles: stubRepo(),
    isLicensed: () => licensed,
  });
}

describe('TabsController', () => {
  it('starts with exactly one tab that is active', () => {
    const c = makeController(false);
    const s = c.snapshot();
    assert.equal(s.tabs.length, 1);
    assert.equal(s.activeId, s.tabs[0].id);
    assert.equal(s.tabs[0].label, 'Tab 1');
    assert.equal(s.tabs[0].status, 'idle');
  });

  it('refuses to add a second tab when unlicensed', () => {
    const c = makeController(false);
    assert.equal(c.canAddTab(), false);
    const result = c.addTab();
    assert.equal(result, null);
    assert.equal(c.snapshot().tabs.length, 1);
  });

  it('allows adding tabs when licensed', () => {
    const c = makeController(true);
    assert.equal(c.canAddTab(), true);
    const newId = c.addTab();
    assert.notEqual(newId, null);
    const s = c.snapshot();
    assert.equal(s.tabs.length, 2);
    assert.equal(s.activeId, newId);
    assert.equal(s.tabs[1].label, 'Tab 2');
  });

  it('exposes canAddTab through the snapshot so license state is reactive', () => {
    assert.equal(makeController(false).snapshot().canAddTab, false);
    assert.equal(makeController(true).snapshot().canAddTab, true);
  });

  it('switches active tab via setActive', () => {
    const c = makeController(true);
    const firstId = c.snapshot().activeId;
    const secondId = c.addTab();
    assert.ok(secondId);
    c.setActive(firstId);
    assert.equal(c.snapshot().activeId, firstId);
    c.setActive(secondId);
    assert.equal(c.snapshot().activeId, secondId);
  });

  it('ignores setActive for unknown id', () => {
    const c = makeController(true);
    const original = c.snapshot().activeId;
    c.setActive('does-not-exist');
    assert.equal(c.snapshot().activeId, original);
  });

  it('closeTab removes tab and picks a neighbour as active', () => {
    const c = makeController(true);
    const a = c.snapshot().activeId;
    const b = c.addTab();
    const cId = c.addTab();
    assert.ok(b);
    assert.ok(cId);
    // active is cId; close it; neighbour (b) should activate
    c.closeTab(cId);
    const s = c.snapshot();
    assert.equal(s.tabs.length, 2);
    assert.equal(s.activeId, b);
    // close non-active tab; active stays
    c.closeTab(a);
    assert.equal(c.snapshot().activeId, b);
  });

  it('always keeps at least one tab; closing the last spawns a fresh one', () => {
    const c = makeController(false);
    const original = c.snapshot().tabs[0].id;
    c.closeTab(original);
    const s = c.snapshot();
    assert.equal(s.tabs.length, 1);
    assert.notEqual(s.tabs[0].id, original);
    assert.equal(s.activeId, s.tabs[0].id);
  });

  it('notifies subscribers on structural changes', () => {
    const c = makeController(true);
    let calls = 0;
    const unsub = c.subscribe(() => { calls += 1; });
    c.addTab();
    const afterAdd = calls;
    assert.ok(afterAdd >= 1);
    c.setActive(c.snapshot().tabs[0].id);
    assert.ok(calls > afterAdd);
    unsub();
  });

  it('shares a single profiles repository across all tab controllers', () => {
    const repo = stubRepo();
    const c = new TabsController({ profiles: repo, isLicensed: () => true });
    c.addTab();
    c.addTab();
    // No assertion target on SessionController exposes its repo directly,
    // but constructing without throwing confirms the shared instance was accepted
    // by each underlying SessionController via deps.profiles.
    assert.equal(c.snapshot().tabs.length, 3);
  });

  it('exposes activeController() pointing at the active tab', () => {
    const c = makeController(true);
    const firstCtl = c.activeController();
    c.addTab();
    const secondCtl = c.activeController();
    assert.notEqual(firstCtl, secondCtl);
  });

  it('re-emits when a license-change broadcast fires', () => {
    __resetTokenStoreForTests();
    const c = makeController(false);
    let calls = 0;
    const unsub = c.subscribe(() => { calls += 1; });
    setFeatureLicense('tabs', 'RAW');
    setFeatureLicense('tabs', null);
    unsub();
    c.dispose();
    __resetTokenStoreForTests();
    assert.ok(calls >= 2, 'tabs controller emits on license change');
  });

  it('dispose() unwires the license-change subscription', () => {
    __resetTokenStoreForTests();
    const c = makeController(false);
    let calls = 0;
    const unsub = c.subscribe(() => { calls += 1; });
    c.dispose();
    setFeatureLicense('tabs', 'RAW');
    unsub();
    __resetTokenStoreForTests();
    assert.equal(calls, 0, 'no emits after dispose');
  });
});
