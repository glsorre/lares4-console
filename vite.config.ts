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
      '@pro/windows': path.resolve(dirname, './src/pro/windows'),
      '@pro/sessions': path.resolve(dirname, './src/pro/sessions'),
      '@pro/repl': path.resolve(dirname, './src/pro/repl'),
      '@': path.resolve(dirname, './src'),
      ws: path.resolve(dirname, './src/infra/ws-browser-shim.ts'),
    },
  },
});
