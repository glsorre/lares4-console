import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WindowsController, type WindowsAdapter } from '../controller.js';

interface Calls {
  opened: { label: string; route: string }[];
}

function makeAdapter(initial: string[] = ['main']): { adapter: WindowsAdapter; calls: Calls; emitOpen: (label: string) => void; emitClose: (label: string) => void } {
  const calls: Calls = { opened: [] };
  const openedListeners = new Set<(l: string) => void>();
  const closedListeners = new Set<(l: string) => void>();
  let labels = [...initial];
  const adapter: WindowsAdapter = {
    currentLabel: () => 'main',
    list: async () => labels,
    open: async (label, route) => {
      calls.opened.push({ label, route });
      labels = [...labels, label];
    },
    onWindowOpened: (cb) => { openedListeners.add(cb); return () => openedListeners.delete(cb); },
    onWindowClosed: (cb) => { closedListeners.add(cb); return () => closedListeners.delete(cb); },
  };
  return {
    adapter,
    calls,
    emitOpen: (label) => { for (const l of openedListeners) l(label); },
    emitClose: (label) => { for (const l of closedListeners) l(label); },
  };
}

async function waitForRefresh(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('WindowsController', () => {
  it('starts with the current window in its snapshot', async () => {
    const { adapter } = makeAdapter(['main']);
    const c = new WindowsController({ adapter, isLicensed: () => false });
    await waitForRefresh();
    const s = c.snapshot();
    assert.equal(s.currentLabel, 'main');
    assert.deepEqual(s.windows.map((w) => w.label), ['main']);
    assert.equal(s.windows[0].isMain, true);
  });

  it('refuses to open a second window when unlicensed (limit reached)', async () => {
    const { adapter, calls } = makeAdapter(['main', 'console-1']);
    const c = new WindowsController({ adapter, isLicensed: () => false });
    await waitForRefresh();
    assert.equal(c.canOpen(), false);
    const result = await c.openWindow('/console');
    assert.equal(result, null);
    assert.deepEqual(calls.opened, []);
  });

  it('opens a window with deterministic label when licensed', async () => {
    const { adapter, calls } = makeAdapter(['main']);
    const c = new WindowsController({
      adapter,
      isLicensed: () => true,
      now: () => 42,
    });
    await waitForRefresh();
    const label = await c.openWindow('/connect');
    assert.equal(label, 'console-42');
    assert.deepEqual(calls.opened, [{ label: 'console-42', route: '/connect' }]);
    assert.ok(c.snapshot().windows.some((w) => w.label === 'console-42'));
  });

  it('updates snapshot when adapter signals window opened/closed', async () => {
    const { adapter, emitOpen, emitClose } = makeAdapter(['main']);
    const c = new WindowsController({ adapter, isLicensed: () => true });
    await waitForRefresh();
    let calls = 0;
    c.subscribe(() => { calls += 1; });
    emitOpen('console-99');
    assert.ok(c.snapshot().windows.some((w) => w.label === 'console-99'));
    assert.ok(calls >= 1);
    emitClose('console-99');
    assert.equal(c.snapshot().windows.some((w) => w.label === 'console-99'), false);
  });

  it('emits snapshot only when a window is genuinely added or removed', async () => {
    const { adapter, emitOpen, emitClose } = makeAdapter(['main']);
    const c = new WindowsController({ adapter, isLicensed: () => true });
    await waitForRefresh();
    let calls = 0;
    c.subscribe(() => { calls += 1; });
    emitOpen('main'); // already present, no emit
    assert.equal(calls, 0);
    emitClose('does-not-exist'); // unknown, no emit
    assert.equal(calls, 0);
  });
});
