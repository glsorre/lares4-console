import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const dirname = path.dirname(fileURLToPath(import.meta.url));

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
  build: {
    outDir: 'dist-desktop',
    sourcemap: true,
  },
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      ws: path.resolve(dirname, './src/infra/ws-browser-shim.ts'),
    },
  },
});
