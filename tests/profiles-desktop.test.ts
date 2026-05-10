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
