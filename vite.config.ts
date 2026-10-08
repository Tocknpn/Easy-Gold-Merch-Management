import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import path from 'node:path';

import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'));

// Build stamp and git metadata shown for Admin and inside crash reports
const gitInfo = (() => {
  let sha = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) || process.env.GITHUB_SHA?.slice(0, 7) || 'nogit';
  let msg = process.env.CF_PAGES_COMMIT_MESSAGE || '';
  let branch = process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || 'main';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || sha;
  } catch {
    /* no git (CI tarball) */
  }
  try {
    msg = execSync('git log -1 --format=%s', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || msg;
  } catch {
    /* no git */
  }
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || branch;
  } catch {
    /* no git */
  }
  return {
    sha,
    msg,
    branch,
    version: pkg.version ? `v${pkg.version}` : 'v2.0.0',
    buildTime: new Date().toISOString().slice(0, 16).replace('T', ' '),
  };
})();

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD__: JSON.stringify(`${gitInfo.sha} · ${gitInfo.buildTime}`),
    __APP_VERSION__: JSON.stringify(gitInfo.version),
    __GIT_COMMIT_HASH__: JSON.stringify(gitInfo.sha),
    __GIT_COMMIT_MSG__: JSON.stringify(gitInfo.msg),
    __GIT_BRANCH__: JSON.stringify(gitInfo.branch),
    __BUILD_TIME__: JSON.stringify(gitInfo.buildTime),
  },
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
