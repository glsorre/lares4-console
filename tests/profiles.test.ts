import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProfilesRepository } from '../src/core/profiles.js';

describe('profiles repository', () => {
  it('upserts, lists, defaults and removes profiles', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lares4-console-profiles-'));
    const repo = new ProfilesRepository(join(dir, 'profiles.json'));
    await repo.upsert({
      name: 'home',
      ip: '192.168.1.10',
      pin: '1234',
      wss: true,
      sender: 'console',
      makeDefault: true,
    });
    await repo.upsert({
      name: 'office',
      ip: '10.0.0.8',
      pin: '9999',
      wss: false,
      sender: 'console-office',
    });
    const listed = await repo.list();
    assert.equal(listed.length, 2);
    assert.equal((await repo.getDefault())?.name, 'home');
    assert.equal(await repo.setDefault('office'), true);
    assert.equal((await repo.getDefault())?.name, 'office');
    assert.equal(await repo.remove('office'), true);
    assert.equal((await repo.get('office')) === undefined, true);
  });
});
