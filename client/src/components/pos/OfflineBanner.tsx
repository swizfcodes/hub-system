// ── OfflineBanner.tsx ──────────────────────────────────────────────────────────
import { WifiOff, RefreshCw } from "lucide-react";
import { usePOSStore } from "@stores/posStore";
import { cn } from "@lib/cn";

export function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount } = usePOSStore((s) => ({
    isOnline: s.isOnline,
    isSyncing: s.isSyncing,
    pendingCount: s.pendingCount,
  }));

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm",
        !isOnline
          ? "bg-amber-900/30 text-amber-300"
          : "bg-blue-900/20 text-blue-300",
      )}
    >
      {!isOnline ? (
        <WifiOff className="h-4 w-4 shrink-0" />
      ) : (
        <RefreshCw
          className={cn("h-4 w-4 shrink-0", isSyncing && "animate-spin")}
        />
      )}
      <span>
        {!isOnline
          ? `You're offline — ${pendingCount} transaction${pendingCount !== 1 ? "s" : ""} will sync when connection restores`
          : isSyncing
            ? `Syncing ${pendingCount} transaction${pendingCount !== 1 ? "s" : ""}...`
            : `${pendingCount} transaction${pendingCount !== 1 ? "s" : ""} pending sync`}
      </span>
    </div>
  );
}
