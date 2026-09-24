import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react';
import {
  BUILD_STAMP, isChunkLoadError, markCrashed, recordCrash, reloadForStaleChunk,
} from '@/lib/crashLog';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** `app` = full-screen card (boot failures); `page` = inside the shell (page crash). */
  scope?: 'app' | 'page';
  /** Change this (e.g. the route) to clear the error when the user navigates away. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  chunk: boolean;
  detail: string;
  copied: boolean;
}

/**
 * Last line of defence. Before this existed, ANY uncaught error — a failed
 * lazy-loaded page chunk, a render exception, a blocked-storage SecurityError —
 * unmounted the whole React root and left a completely blank page (no sidebar,
 * no spinner, no message). Now the user gets a readable card with Reload and
 * Copy details, and the crash is recorded for Diagnostics.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null, chunk: false, detail: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, chunk: isChunkLoadError(error?.message) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const chunk = isChunkLoadError(error?.message);
    const detail = [error?.name, error?.message, error?.stack, info?.componentStack]
      .filter(Boolean)
      .join('\n');
    recordCrash({
      message: error?.message || 'Unknown render error',
      stack: detail,
      source: chunk ? 'preload' : this.props.scope === 'app' ? 'render' : 'page',
    });
    // A chunk that no longer exists usually means "a new build was published
    // while this tab was open" — one silent reload fixes it (capped, no loops).
    if (chunk && reloadForStaleChunk()) return;
    markCrashed(true);
    this.setState({ detail });
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.reset();
  }

  private reset = () => {
    markCrashed(false);
    this.setState({ error: null, chunk: false, detail: '', copied: false });
  };

  private reload = () => {
    markCrashed(false);
    window.location.reload();
  };

  private copy = async () => {
    const { error, detail } = this.state;
    const text = [
      `message: ${error?.message || 'unknown'}`,
      `build: ${BUILD_STAMP}`,
      `url: ${typeof location !== 'undefined' ? location.href : ''}`,
      `ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
      detail,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch {
      // Clipboard blocked — the details are already on screen to select.
      this.setState({ copied: false });
    }
  };

  render() {
    const { children, scope = 'app' } = this.props;
    const { error, chunk, copied } = this.state;
    if (!error) return children;

    const title = chunk ? 'This page needs a reload' : 'Something went wrong on this screen';
    const hint = chunk
      ? 'A new version of the system was published (or the connection dropped) while this tab was open, so a file it needs is no longer available. Reload to pick up the latest version.'
      : 'The screen could not be drawn. No changes were saved from this view — the rest of the system is unaffected.';

    return (
      <div className={scope === 'app' ? 'flex min-h-screen items-center justify-center p-6' : 'p-4'}>
        <div className="card card-pad w-full max-w-xl text-left">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-slate-800">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{hint}</p>
              <p className="mt-2 break-words rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600">
                {error.message || 'Unknown error'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="btn btn-primary btn-sm" onClick={this.reload}>
                  <RefreshCw className="h-3.5 w-3.5" /> Reload page
                </button>
                <button className="btn btn-secondary btn-sm" onClick={this.copy}>
                  <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy details'}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Build {BUILD_STAMP} · this report is saved under Diagnostics → Last app crash.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
