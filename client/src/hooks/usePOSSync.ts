import { useEffect, useRef } from "react";
import { usePOSStore } from "@stores/posStore";
import {
  getPendingTransactions,
  markTransactionSyncing,
  markTransactionSynced,
  markTransactionConflict,
  clearSyncedTransactions,
} from "@lib/posDb";
import { syncOfflineTransactions } from "@services/pos/transactions";
import { SYNC_INTERVAL_MS, SYNC_BATCH_SIZE } from "@lib/constants/posConstants";
import { showToast } from "@hooks/useToast";

/**
 * Mount this hook once inside POSSession. It:
 * 1. Polls for pending offline transactions every SYNC_INTERVAL_MS ms
 * 2. Sends batches to POST /api/pos/sync when online
 * 3. Updates sync status per transaction in IndexedDB
 * 4. Refreshes the pending count in the store
 * 5. Toasts on conflicts so the cashier is aware
 */
export function usePOSSync(sessionId: string | null) {
  const { isOnline, setIsSyncing, refreshPendingCount } = usePOSStore((s) => ({
    isOnline: s.isOnline,
    setIsSyncing: s.setIsSyncing,
    refreshPendingCount: s.refreshPendingCount,
  }));

  const isSyncingRef = useRef(false);
  // H3 fix: use a ref for isOnline so the interval callback always reads current value
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  async function runSync() {
    if (!sessionId || !isOnlineRef.current || isSyncingRef.current) return;

    const pending = await getPendingTransactions();
    if (!pending.length) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const batch = pending.slice(0, SYNC_BATCH_SIZE);

      // Mark all as "syncing" so they don't get re-picked on the next tick
      await Promise.all(batch.map((t) => markTransactionSyncing(t.offline_id)));

      const response = await syncOfflineTransactions(sessionId, batch);

      for (const result of response.results) {
        if (result.success) {
          await markTransactionSynced(result.offline_id);
        } else if (result.conflict_type === "duplicate") {
          // Already on server — mark synced silently
          await markTransactionSynced(result.offline_id);
        } else {
          await markTransactionConflict(
            result.offline_id,
            result.conflict_type,
            result.error ?? "Unknown sync error",
          );
          showToast.error(
            `Sync conflict: ${result.error ?? result.conflict_type} (${result.offline_id.slice(0, 8)})`,
          );
        }
      }

      await clearSyncedTransactions();
    } catch {
      // Network error during sync — transactions stay in 'syncing' state.
      // Next tick will re-attempt them (getPendingTransactions includes 'conflict').
      // Reset syncing → pending so next pass retries
      // L2 fix: label as "network_error" not "validation" — this is a connectivity failure
      const stillPending = await getPendingTransactions();
      await Promise.all(
        stillPending
          .filter((t) => t.sync_status === "syncing")
          .map((t) =>
            markTransactionConflict(
              t.offline_id,
              "network_error",
              "Sync failed — will retry",
            ),
          ),
      );
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }

  useEffect(() => {
    if (!sessionId) return;

    // Run immediately on mount / when connection restores
    runSync();

    const interval = setInterval(runSync, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isOnline]);
}
