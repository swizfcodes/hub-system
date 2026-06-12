import { Sparkles } from "lucide-react";

/**
 * A small notice rendered when the concierge endpoints aren't mounted
 * on the backend yet. The panels themselves render empty states; this
 * sits above them to set expectations.
 */
export function ConciergeNotice() {
  return (
    <div className="rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.04] p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-brand-accent/15 text-brand-accent flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="text-sm">
        <p className="text-brand-cream font-medium">
          Concierge profile coming soon
        </p>
        <p className="text-brand-cloud text-xs mt-1">
          Preferences, milestones, and personalised notes for this customer will
          appear here. This panel will populate once the Concierge module is
          enabled for your account.
        </p>
      </div>
    </div>
  );
}
