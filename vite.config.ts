import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Build stamp shown in Diagnostics (and inside every crash report) so we can
// tell whether the running tab matches the deployment.
const buildStamp = (() => {
  let sha = 'nogit';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || sha;
  } catch {
    /* no git (CI tarball) — keep the placeholder */
  }
  return `${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
})();

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(buildStamp) },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-xlsx': ['xlsx'],
          // PDF export used to be bundled into the (460 kB) Reporting page chunk.
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 8080,
    hmr: { overlay: false },
  },
});
