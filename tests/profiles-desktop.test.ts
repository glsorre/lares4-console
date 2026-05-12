import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DesktopProfilesRepository } from '../src/desktop/runtime/profiles-repository-desktop.js';

describe('desktop profiles repository (injected persistence)', () => {
  it('upserts and sets default profile', async () => {
    let stored = '';
    const repo = new DesktopProfilesRepository({
      read: async () => stored || null,
      write: async (content) => { stored = content; },
    });

    await repo.upsert({
      name: 'home',
      ip: '192.168.1.1',
      pin: '1234',
      wss: true,
      sender: 's',
      makeDefault: true,
    });

    const data = await repo.readAll();
    assert.equal(data.defaultProfile, 'home');
    assert.equal(data.profiles.length, 1);
    assert.equal(data.profiles[0]?.name, 'home');
    assert.ok(data.profiles[0]?.createdAt);
    assert.equal(data.profiles[0]?.createdAt, data.profiles[0]?.updatedAt);
  });

  it('round-trips logTagFilters through upsert and readAll', async () => {
    let stored = '';
    const repo = new DesktopProfilesRepository({
      read: async () => stored || null,
      write: async (content) => { stored = content; },
    });
    await repo.upsert({
      name: 'home',
      ip: '1.1.1.1',
      pin: '1',
      wss: true,
      sender: 's',
      logTagFilters: ['ACK', 'CHANGE'],
    });
    const after = await repo.readAll();
    assert.deepEqual(after.profiles[0]?.logTagFilters, ['ACK', 'CHANGE']);
    await repo.setLogTagFilters('home', ['ERROR']);
    const next = await repo.readAll();
    assert.deepEqual(next.profiles[0]?.logTagFilters, ['ERROR']);
    await repo.setLogTagFilters('home', undefined);
    const cleared = await repo.readAll();
    assert.equal(cleared.profiles[0]?.logTagFilters, undefined);
  });

  it('drops invalid logTagFilters values on read', async () => {
    const stored = JSON.stringify({
      version: 1,
      profiles: [{
        name: 'home', ip: '1.1.1.1', pin: '1', wss: true, sender: 's',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        logTagFilters: ['ACK', 'BOGUS', 42, 'ERROR'],
      }],
    });
    const repo = new DesktopProfilesRepository({
      read: async () => stored,
      write: async () => {},
    });
    const data = await repo.readAll();
    assert.deepEqual(data.profiles[0]?.logTagFilters, ['ACK', 'ERROR']);
  });

  it('round-trips macros through upsert and setMacros', async () => {
    let stored = '';
    const repo = new DesktopProfilesRepository({
      read: async () => stored || null,
      write: async (content) => { stored = content; },
    });
    await repo.upsert({
      name: 'home', ip: '1.1.1.1', pin: '1', wss: true, sender: 's',
      macros: [{
        id: 'a', name: 'morning', steps: [{ command: 'lights on 1' }, { command: 'lights on 2', delayMs: 500 }],
        createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
      }],
    });
    const after = await repo.readAll();
    assert.equal(after.profiles[0]?.macros?.length, 1);
    assert.equal(after.profiles[0]?.macros?.[0]?.steps[1]?.delayMs, 500);
    await repo.setMacros('home', []);
    const next = await repo.readAll();
    assert.deepEqual(next.profiles[0]?.macros, []);
  });

  it('drops invalid macros on read', async () => {
    const stored = JSON.stringify({
      version: 1,
      profiles: [{
        name: 'home', ip: '1.1.1.1', pin: '1', wss: true, sender: 's',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        macros: [
          { id: 'a', name: 'ok', steps: [{ command: 'x' }], createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
          { name: 'missing-id', steps: [] },
          'garbage',
          { id: 'b', name: 'bad-steps', steps: [{ delayMs: 100 }], createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
        ],
      }],
    });
    const repo = new DesktopProfilesRepository({
      read: async () => stored,
      write: async () => {},
    });
    const data = await repo.readAll();
    const macros = data.profiles[0]?.macros ?? [];
    assert.equal(macros.length, 2);
    assert.equal(macros[0]?.name, 'ok');
    assert.equal(macros[1]?.name, 'bad-steps');
    assert.equal(macros[1]?.steps.length, 0);
  });

  it('remove clears default when deleted profile was default', async () => {
    const initial = {
      version: 1 as const,
      defaultProfile: 'a',
      profiles: [
        {
          name: 'a',
          ip: '1.1.1.1',
          pin: '1',
          wss: true,
          sender: 's',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
        {
          name: 'b',
          ip: '2.2.2.2',
          pin: '2',
          wss: false,
          sender: 's',
          createdAt: '2020-01-02T00:00:00.000Z',
          updatedAt: '2020-01-02T00:00:00.000Z',
        },
      ],
    };

    let stored = JSON.stringify(initial, null, 2);
    const repo = new DesktopProfilesRepository({
      read: async () => stored,
      write: async (content) => { stored = content; },
    });

    await repo.remove('a');
    const data = JSON.parse(stored) as { defaultProfile?: string; profiles: { name: string }[] };
    assert.deepEqual(data.profiles.map((p) => p.name), ['b']);
    assert.equal(data.defaultProfile, 'b');
  });
});
