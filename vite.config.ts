import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(readFileSync(path.resolve(dirname, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
  author?: string;
  repository?: { url?: string } | string;
};
const repoUrl =
  typeof pkg.repository === 'string'
    ? pkg.repository
    : (pkg.repository?.url ?? '');

// Ed25519 public keys (32-byte hex) accepted by this build. The verifier
// tries each in declared order — putting the current production key first
// and any predecessor key second keeps already-issued tokens valid through
// a rotation overlap window. Override at build time via the
// LARES4_LICENSE_PUBKEY env var (comma-separated for multiple keys).
//
// fingerprint: 887772be
const PRODUCTION_LICENSE_PUBKEYS: readonly string[] = [
  '887772be1db8c3232aa315d5e9f37d198ea2c102b61d01410e4b7f7b785e8250',
];
const envPubkeys = (process.env.LARES4_LICENSE_PUBKEY ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);
const licensePubkeys: readonly string[] =
  envPubkeys.length > 0 ? envPubkeys : PRODUCTION_LICENSE_PUBKEYS;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'events', 'http', 'https', 'os', 'path', 'stream', 'url', 'util', 'zlib'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_REPO__: JSON.stringify(repoUrl),
    __APP_AUTHOR__: JSON.stringify(pkg.author ?? ''),
    __LICENSE_PUBKEYS__: JSON.stringify(licensePubkeys),
  },
  build: {
    outDir: 'dist-desktop',
    sourcemap: true,
  },
  clearScreen: false,
  resolve: {
    alias: {
      '@pro/macros': path.resolve(dirname, './src/pro/macros'),
      '@pro/tabs': path.resolve(dirname, './src/pro/tabs'),
      '@pro/triggers': path.resolve(dirname, './src/pro/triggers'),
      '@pro/annotations': path.resolve(dirname, './src/pro/annotations'),
      '@': path.resolve(dirname, './src'),
      ws: path.resolve(dirname, './src/infra/ws-browser-shim.ts'),
    },
  },
});
