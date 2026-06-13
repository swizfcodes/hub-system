// ── hooks/useUnreadTotal.ts ───────────────────────────────────────────────
// Live total of unread chat messages across every conversation. One shared
// react-query entry (["unread-count"]) feeds the app-grid tile, the
// floating launcher, the tab title and the favicon badge. Socket events
// keep it fresh in real time; the interval is just a safety net.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getUnreadCount } from "@services/messaging";
import { useSocketEvent } from "@hooks/useMessaging";

export function useUnreadTotal(): number {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
  useSocketEvent(
    ["message:new", "message:read", "message:deleted", "channel:updated"],
    () => qc.invalidateQueries({ queryKey: ["unread-count"] }),
  );
  return data ?? 0;
}
