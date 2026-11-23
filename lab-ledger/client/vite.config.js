import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

/** Writes a hash of dist/index.html into dist/sw.js, so every deploy gets its own cache name. */
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist');
      const sw = path.join(dist, 'sw.js');
      const index = path.join(dist, 'index.html');
      if (!fs.existsSync(sw) || !fs.existsSync(index)) return;
      const id = crypto.createHash('sha1').update(fs.readFileSync(index)).digest('hex').slice(0, 10);
      fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replaceAll('__BUILD_ID__', id));
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'], query: ['@tanstack/react-query', 'axios'] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:5000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
});
