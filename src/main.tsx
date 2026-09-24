import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { describeError, markHealthyBoot, recordCrash, reloadForStaleChunk } from '@/lib/crashLog';

// ── Global safety net ────────────────────────────────────────────────────
// Anything that escapes React — or happens before it mounts — is recorded for
// Diagnostics → "Last app crash" instead of leaving a silent blank page.
window.addEventListener('error', (event) => {
  recordCrash({
    message: event.message || 'Script error',
    stack: (event.error && event.error.stack) || null,
    source: 'window',
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const { message, stack } = describeError(event.reason);
  recordCrash({ message, stack, source: 'promise' });
});

// Vite fires this when a `modulepreload`d chunk cannot be fetched — normally a
// tab left open across a deploy. Reload once (capped) to pick up the new build.
window.addEventListener('vite:preloadError', ((event: Event) => {
  event.preventDefault?.();
  recordCrash({
    message: 'Failed to preload a code-split chunk (stale build or dropped connection)',
    source: 'preload',
  });
  reloadForStaleChunk();
}) as EventListener);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Re-arm the stale-chunk reload budget when a boot completes cleanly.
markHealthyBoot();