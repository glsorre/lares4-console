import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
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

  it('quarantines unparseable JSON and surfaces loadError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lares4-console-profiles-'));
    const path = join(dir, 'profiles.json');
    await writeFile(path, '{ not json', 'utf8');
    const repo = new ProfilesRepository(path);
    const data = await repo.readAll();
    assert.equal(data.profiles.length, 0);
    assert.ok(data.loadError);
    assert.match(data.loadError.reason, /unreadable/i);
    assert.ok(data.loadError.quarantinedTo?.startsWith('profiles.corrupt-'));
    const files = await readdir(dir);
    assert.ok(files.some((f) => f.startsWith('profiles.corrupt-') && f.endsWith('.json')));
  });

  it('quarantines schema-violating file and surfaces loadError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lares4-console-profiles-'));
    const path = join(dir, 'profiles.json');
    await writeFile(path, JSON.stringify({ version: 1, profiles: [{ name: 'home' }] }), 'utf8');
    const repo = new ProfilesRepository(path);
    const data = await repo.readAll();
    assert.equal(data.profiles.length, 0);
    assert.ok(data.loadError);
    assert.match(data.loadError.reason, /schema mismatch/i);
    const files = await readdir(dir);
    assert.ok(files.some((f) => f.startsWith('profiles.corrupt-')));
  });
});
