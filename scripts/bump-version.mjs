#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '..');

const target = process.env.npm_package_version ?? process.argv[2];
if (!target) {
  console.error('bump-version: no target version. Run via `npm version <ver>` or pass as argv[2].');
  process.exit(1);
}

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
if (!SEMVER.test(target)) {
  console.error(`bump-version: "${target}" is not a valid SemVer.`);
  process.exit(1);
}

const tauriConfPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(root, 'src-tauri', 'Cargo.toml');

const conf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
conf.version = target;
writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + '\n');

const toml = readFileSync(cargoTomlPath, 'utf8');
const tomlNext = toml.replace(/^version = "[^"]*"$/m, `version = "${target}"`);
if (tomlNext === toml) {
  console.error('bump-version: failed to patch src-tauri/Cargo.toml (no `version = "..."` line matched).');
  process.exit(1);
}
writeFileSync(cargoTomlPath, tomlNext);

execSync('cargo check --quiet', { cwd: path.join(root, 'src-tauri'), stdio: 'inherit' });

execSync(
  'git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock',
  { cwd: root, stdio: 'inherit' },
);

console.log(`bump-version: tauri.conf.json + Cargo.toml + Cargo.lock → ${target}`);
