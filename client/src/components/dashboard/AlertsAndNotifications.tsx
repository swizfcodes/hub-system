/**
 * AlertsStrip — compact top bar surfacing urgent items needing action.
 * NotificationsPanel — full tab for the notification history.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { X, Bell, CheckCheck, ExternalLink, Settings } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@services/dashboard";
import { getNotificationMeta } from "@lib/constants/dashboardConstants";
import { fmtDate } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { AlertItem, AppNotification } from "@typedefs/dashboard";

// ── AlertsStrip ───────────────────────────────────────────────────────────────

interface AlertsStripProps {
  alerts: AlertItem[];
}

export function AlertsStrip({ alerts }: AlertsStripProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = alerts.filter((a) => !dismissed.includes(a.id));
  if (!visible.length) return null;

  return (
    <div className="space-y-1.5">
      {visible.map((alert) => {
        const isError = alert.severity === "error";

        return (
          <div
            key={alert.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-2.5",
              isError
                ? "border-red-500/30 bg-red-900/10"
                : "border-amber-500/30 bg-amber-900/10",
            )}
          >
            <span className="text-base shrink-0">{alert.icon}</span>
            <p
              className={cn(
                "flex-1 text-sm font-medium",
                isError ? "text-red-300" : "text-amber-300",
              )}
            >
              {alert.label}
              {alert.count !== undefined && (
                <span className="font-normal text-xs ml-2 opacity-80">
                  {alert.count} {alert.count === 1 ? "item" : "items"}
                  {alert.amount ? ` · ₦${alert.amount.toLocaleString()}` : ""}
                </span>
              )}
            </p>
            <button
              onClick={() => navigate(alert.href)}
              className={cn(
                "flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline",
                isError ? "text-red-300" : "text-amber-300",
              )}
            >
              View <ExternalLink className="h-3 w-3" />
            </button>
            <button
              onClick={() => setDismissed((d) => [...d, alert.id])}
              className={cn(
                "shrink-0",
                isError
                  ? "text-red-400/50 hover:text-red-400"
                  : "text-amber-400/50 hover:text-amber-400",
              )}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── NotificationsPanel ────────────────────────────────────────────────────────

export function NotificationsPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", page, unreadOnly],
    queryFn: () => listNotifications({ page, limit: 30, unreadOnly }),
    refetchInterval: 60_000,
  });

  const notifications = data?.data ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (err) => showToast.error(errMsg(err)),
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      showToast.success("All marked as read");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  // Group by relative date
  const groups = groupByDate(notifications);

  return (
    <div className="space-y-4">
      {/* Header toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-brand-cream">
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent text-[10px] font-bold text-brand-black px-1">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUnreadOnly((u) => !u)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              unreadOnly
                ? "bg-brand-accent text-brand-black"
                : "bg-brand-graphite/30 text-brand-smoke hover:text-brand-cream",
            )}
          >
            Unread only
          </button>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => markAllMutation.mutate()}
              loading={markAllMutation.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
          <button
            onClick={() => navigate("/settings/notifications")}
            className="text-brand-smoke hover:text-brand-accent transition-colors"
            title="Notification preferences"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Notification groups */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Bell className="h-10 w-10 text-brand-smoke/30" />
          <p className="text-sm text-brand-smoke">
            {unreadOnly ? "No unread notifications" : "No notifications yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(({ label, items }) => (
            <div key={label} className="space-y-1.5">
              <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke/60 px-1">
                {label}
              </p>
              {items.map((n) => (
                <NotificationRow
                  key={n.notification_id}
                  notification={n}
                  onRead={() => markReadMutation.mutate(n.notification_id)}
                  onNavigate={() => {
                    if (!n.is_read) markReadMutation.mutate(n.notification_id);
                    if (n.action_url) navigate(n.action_url);
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NotificationRow ───────────────────────────────────────────────────────────

function NotificationRow({
  notification: n,
  onRead,
  onNavigate,
}: {
  notification: AppNotification;
  onRead: () => void;
  onNavigate: () => void;
}) {
  const meta = getNotificationMeta(n.type);

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border px-4 py-3 transition-all",
        n.is_read
          ? "border-white/5 bg-brand-charcoal/50"
          : "border-white/10 bg-brand-charcoal",
      )}
    >
      {/* Icon */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
        style={{ backgroundColor: `${meta.color}20` }}
      >
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium",
            n.is_read ? "text-brand-smoke" : "text-brand-cream",
          )}
        >
          {n.title}
        </p>
        {n.body && (
          <p className="text-xs text-brand-smoke/70 mt-0.5 line-clamp-2">
            {n.body}
          </p>
        )}
        <p className="text-[10px] text-brand-smoke/50 mt-1">
          {fmtDate(n.created_at)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {n.action_url && (
          <button
            onClick={onNavigate}
            className="opacity-0 group-hover:opacity-100 text-brand-smoke hover:text-brand-accent transition-all"
            title="Go to"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
        {!n.is_read && (
          <button
            onClick={onRead}
            className="opacity-0 group-hover:opacity-100 text-brand-smoke hover:text-brand-accent transition-all"
            title="Mark as read"
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </button>
        )}
        {!n.is_read && <div className="h-2 w-2 rounded-full bg-brand-accent" />}
      </div>
    </div>
  );
}

// ── Group helper ──────────────────────────────────────────────────────────────

function groupByDate(notifications: AppNotification[]) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const groups: { label: string; items: AppNotification[] }[] = [];
  const buckets: Record<string, AppNotification[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };

  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (isSameDay(d, today)) {
      buckets["Today"].push(n);
    } else if (isSameDay(d, yesterday)) {
      buckets["Yesterday"].push(n);
    } else if (d >= weekAgo) {
      buckets["This week"].push(n);
    } else {
      buckets["Earlier"].push(n);
    }
  }

  for (const [label, items] of Object.entries(buckets)) {
    if (items.length > 0) groups.push({ label, items });
  }
  return groups;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
