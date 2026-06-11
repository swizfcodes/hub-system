/**
 * NotificationsPanel
 * Dropdown off the Bell button in the Topbar.
 *
 * Features:
 *  - Live unread count badge (polling every 60s + socket refresh)
 *  - List of 20 most recent notifications
 *  - Click → marks read + navigates to action_url
 *  - "Mark all read" button
 *  - Closes on outside click or Escape
 */

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  X,
  CheckCheck,
  Package,
  DollarSign,
  AlertCircle,
  Info,
  CheckCircle,
} from "lucide-react";
import { api } from "@services/api";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Notification {
  notification_id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

interface NotificationsResponse {
  data: Notification[];
  unread_count: number;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchNotifications(): Promise<NotificationsResponse> {
  const { data } = await api.get<NotificationsResponse>("/notifications", {
    params: { limit: 20 },
  });
  return data;
}

async function markOneRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

async function markAllReadApi(): Promise<void> {
  await api.patch("/notifications/read-all");
}

// ── Notification type icon ────────────────────────────────────────────────────

function NotifIcon({ type }: { type: string }) {
  const cls = "h-4 w-4 shrink-0 mt-0.5";
  if (type === "approval_required")
    return <AlertCircle className={cn(cls, "text-amber-400")} />;
  if (type.includes("payment") || type.includes("invoice"))
    return <DollarSign className={cn(cls, "text-green-400")} />;
  if (type.includes("stock") || type.includes("low"))
    return <Package className={cn(cls, "text-orange-400")} />;
  if (type.includes("success") || type.includes("complete"))
    return <CheckCircle className={cn(cls, "text-emerald-400")} />;
  return <Info className={cn(cls, "text-brand-accent")} />;
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Socket bridge ─────────────────────────────────────────────────────────────
// When the backend emits `notification:new` via socket.io, call:
//   dispatchNotificationEvent(payload)
// from wherever socket.io is initialised in the app.
export const NOTIF_SOCKET_EVENT = "orika:notification:new";
export function dispatchNotificationEvent(detail: unknown) {
  window.dispatchEvent(new CustomEvent(NOTIF_SOCKET_EVENT, { detail }));
}

// ── Panel component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { active } = useActiveBusiness();
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", active],
    queryFn: fetchNotifications,
    enabled: !!active,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const notifications = data?.data ?? [];
  const unreadCount = data?.unread_count ?? 0;

  // Refresh when a socket event fires
  useEffect(() => {
    const handler = () =>
      qc.invalidateQueries({ queryKey: ["notifications", active] });
    window.addEventListener(NOTIF_SOCKET_EVENT, handler);
    return () => window.removeEventListener(NOTIF_SOCKET_EVENT, handler);
  }, [active, qc]);

  const readOne = useMutation({
    mutationFn: markOneRead,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["notifications", active] }),
  });

  const readAll = useMutation({
    mutationFn: markAllReadApi,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["notifications", active] }),
  });

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onMouse = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouse);
    };
  }, [open, onClose]);

  function handleClick(n: Notification) {
    if (!n.is_read) readOne.mutate(n.notification_id);
    onClose();
    if (n.action_url) navigate(n.action_url);
  }

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-white/10 bg-brand-black shadow-2xl z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-brand-accent" />
          <span className="text-sm font-semibold text-brand-cream">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-brand-accent/20 px-2 py-0.5 text-[10px] font-bold text-brand-accent">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={() => readAll.mutate()}
              disabled={readAll.isPending}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-brand-smoke hover:text-brand-cream hover:bg-brand-graphite transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" /> All read
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-brand-smoke hover:text-brand-cream hover:bg-brand-graphite transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-white/5">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-brand-graphite shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-brand-graphite rounded w-3/4" />
                  <div className="h-2 bg-brand-graphite rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <Bell className="h-8 w-8 text-brand-smoke/30 mb-3" />
            <p className="text-sm font-medium text-brand-smoke">
              You're all caught up
            </p>
            <p className="text-xs text-brand-smoke/40 mt-1">
              No notifications right now
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.notification_id}
              onClick={() => handleClick(n)}
              className={cn(
                "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                n.is_read
                  ? "hover:bg-brand-graphite/20"
                  : "bg-brand-accent/[0.04] hover:bg-brand-accent/[0.07]",
              )}
            >
              {/* Unread indicator */}
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 rounded-full shrink-0 transition-colors",
                  n.is_read ? "bg-transparent" : "bg-brand-accent",
                )}
              />

              <NotifIcon type={n.type} />

              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-xs leading-snug line-clamp-2",
                    n.is_read
                      ? "text-brand-smoke"
                      : "font-semibold text-brand-cream",
                  )}
                >
                  {n.title}
                </p>
                {n.body && (
                  <p className="text-[11px] text-brand-smoke/60 mt-0.5 line-clamp-2 leading-relaxed">
                    {n.body}
                  </p>
                )}
                <p className="text-[10px] text-brand-smoke/35 mt-1">
                  {relTime(n.created_at)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {notifications.length > 0 && (
        <div className="border-t border-white/5 px-4 py-2 text-center">
          <p className="text-[10px] text-brand-smoke/35">
            Showing {notifications.length} most recent
          </p>
        </div>
      )}
    </div>
  );
}

// ── Exported hook — Topbar uses this for the badge count ─────────────────────

export function useUnreadCount(): number {
  const { active } = useActiveBusiness();
  const { data } = useQuery({
    queryKey: ["notifications", active],
    queryFn: fetchNotifications,
    enabled: !!active,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return data?.unread_count ?? 0;
}
