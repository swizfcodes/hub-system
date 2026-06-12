// ── SessionHeader.tsx ──────────────────────────────────────────────────────────
import { LogOut, BarChart2 } from "lucide-react";
import { usePOSStore } from "@stores/posStore";
import { Button } from "@components/ui/Button";
import { fmtMoney } from "@lib/format";

interface SessionHeaderProps {
  onClose: () => void;
  onXReport: () => void;
  currency?: string;
}

export function SessionHeader({
  onClose,
  onXReport,
  currency = "NGN",
}: SessionHeaderProps) {
  const { session, terminal, pendingCount, parked } = usePOSStore((s) => ({
    session: s.session,
    terminal: s.terminal,
    pendingCount: s.pendingCount,
    parked: s.parked,
  }));

  if (!session) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-brand-charcoal px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-cream">
            {terminal?.name ?? "POS"}
          </p>
          <p className="text-xs text-brand-smoke">
            Float: {fmtMoney(session.opening_float, currency)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {parked.length > 0 && (
          <span className="rounded-full bg-brand-graphite px-2 py-0.5 text-xs text-brand-cloud">
            {parked.length} parked
          </span>
        )}
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-xs text-amber-300">
            {pendingCount} pending sync
          </span>
        )}

        <button
          onClick={onXReport}
          title="X Report"
          className="rounded-lg p-1.5 text-brand-smoke hover:text-brand-accent transition-colors"
        >
          <BarChart2 className="h-4 w-4" />
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-red-400 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Close Session</span>
        </Button>
      </div>
    </div>
  );
}
