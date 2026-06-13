import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ErrorBoundary } from "@components/shared/ErrorBoundary";
import "./styles/index.css";

// ── PWA installability ──────────────────────────────────────────────────────
// Register the service worker on every load (not just after notification
// permission) so the install criteria are met for fresh mobile visitors, and
// capture `beforeinstallprompt` early — it can fire before React mounts. We
// stash it on window and re-broadcast so useInstallPrompt can replay it from
// our own "Install app" button (Android Chrome shows no automatic banner).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* unsupported / blocked — app still works, just not installable */
    });
  });
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  (window as unknown as { __hubInstallPrompt?: Event }).__hubInstallPrompt = e;
  window.dispatchEvent(new Event("hub:can-install"));
});
window.addEventListener("appinstalled", () => {
  (window as unknown as { __hubInstallPrompt?: Event }).__hubInstallPrompt =
    undefined;
});


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
