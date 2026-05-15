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

  it('quarantines and surfaces loadError when JSON is unparseable', async () => {
    const quarantineCalls: string[] = [];
    const repo = new DesktopProfilesRepository({
      read: async () => '{ not json',
      write: async () => {},
      quarantine: async (suffix) => {
        quarantineCalls.push(suffix);
        return `profiles.corrupt-${suffix}.json`;
      },
    });
    const data = await repo.readAll();
    assert.equal(data.profiles.length, 0);
    assert.equal(data.defaultProfile, undefined);
    assert.ok(data.loadError, 'expected loadError');
    assert.match(data.loadError.reason, /unreadable/i);
    assert.equal(data.loadError.quarantinedTo, `profiles.corrupt-${quarantineCalls[0]}.json`);
    assert.equal(quarantineCalls.length, 1);
    assert.match(quarantineCalls[0] ?? '', /^\d{4}-\d{2}-\d{2}T/);
  });

  it('quarantines and surfaces loadError when schema is violated', async () => {
    const quarantineCalls: string[] = [];
    const stored = JSON.stringify({
      version: 1,
      profiles: [{ name: 'home' /* missing all other required fields */ }],
    });
    const repo = new DesktopProfilesRepository({
      read: async () => stored,
      write: async () => {},
      quarantine: async (suffix) => {
        quarantineCalls.push(suffix);
        return `profiles.corrupt-${suffix}.json`;
      },
    });
    const data = await repo.readAll();
    assert.equal(data.profiles.length, 0);
    assert.ok(data.loadError);
    assert.match(data.loadError.reason, /schema mismatch/i);
    assert.equal(quarantineCalls.length, 1);
  });

  it('drops loadError and quarantine call when file is missing', async () => {
    const quarantineCalls: string[] = [];
    const repo = new DesktopProfilesRepository({
      read: async () => null,
      write: async () => {},
      quarantine: async (suffix) => { quarantineCalls.push(suffix); return ''; },
    });
    const data = await repo.readAll();
    assert.equal(data.profiles.length, 0);
    assert.equal(data.loadError, undefined);
    assert.equal(quarantineCalls.length, 0);
  });

  it('still returns empty + loadError when quarantine itself throws', async () => {
    const repo = new DesktopProfilesRepository({
      read: async () => '{ broken',
      write: async () => {},
      quarantine: async () => { throw new Error('rename failed'); },
    });
    const data = await repo.readAll();
    assert.equal(data.profiles.length, 0);
    assert.ok(data.loadError);
    assert.equal(data.loadError.quarantinedTo, undefined);
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
