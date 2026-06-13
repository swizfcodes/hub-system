// ── ErrorBoundary ─────────────────────────────────────────────────────────────
// App-wide safety net. Before this existed, ANY uncaught exception thrown during
// render (a malformed realtime payload, a null deref, a lazy-chunk import that
// failed on a flaky network after the tab woke from sleep) would tear down the
// whole React tree under #root — leaving the bare near-black <body> behind, i.e.
// the "screen just went dark, had to refresh" bug. React only catches render
// errors via a class component's componentDidCatch / getDerivedStateFromError,
// so this is intentionally a class.
//
// A failed lazy-loaded chunk is treated specially: it's almost always a stale
// deploy / transient network issue, and a reload pulls the fresh bundle.

import React from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
}

function looksLikeChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return (
    /loading chunk|dynamically imported module|failed to fetch|importing a module script/i.test(
      msg,
    )
  );
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, isChunkError: looksLikeChunkError(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Surface in the console for debugging; this is where a real error-reporting
    // hook (Sentry, etc.) would go.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Uncaught render error:", error, info);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { isChunkError } = this.state;

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-brand-black p-6 text-brand-cream">
        <div className="w-full max-w-md rounded-2xl border border-brand-graphite bg-brand-charcoal p-8 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-state-warn/15 text-state-warn">
            <TriangleAlert className="h-6 w-6" />
          </div>
          <h2 className="font-display text-2xl text-brand-cream">
            {isChunkError ? "A new version is available" : "Something went wrong"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-brand-cloud">
            {isChunkError
              ? "Part of the app couldn’t load — this usually means it was updated while your tab was open. Reloading will fetch the latest version."
              : "The page hit an unexpected error. Reloading should put things right. If it keeps happening, please let us know."}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={this.reload}
              className="relative inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-accent px-5 text-sm font-semibold tracking-wide text-brand-black transition-all hover:bg-brand-accent-glow"
            >
              <RotateCw className="h-4 w-4" />
              Reload the page
            </button>
            <a
              href="/login"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-transparent px-5 text-sm font-semibold tracking-wide text-brand-cloud transition-all hover:bg-white/5 hover:text-brand-cream"
            >
              Go to login
            </a>
          </div>
        </div>
      </div>
    );
  }
}
