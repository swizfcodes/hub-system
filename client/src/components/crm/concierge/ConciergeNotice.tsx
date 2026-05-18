import { Sparkles } from 'lucide-react';

/**
 * A small notice rendered when the concierge endpoints aren't mounted
 * on the backend yet. The panels themselves render empty states; this
 * sits above them to set expectations.
 */
export function ConciergeNotice() {
  return (
    <div className="rounded-2xl border border-orika-gold/30 bg-orika-gold/[0.04] p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-orika-gold/15 text-orika-gold flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="text-sm">
        <p className="text-orika-cream font-medium">Concierge profile — backend pending</p>
        <p className="text-orika-cloud text-xs mt-1">
          The <code className="font-mono text-orika-gold">customer_preferences</code> and <code className="font-mono text-orika-gold">customer_milestones</code> tables exist, but the REST endpoints
          aren't mounted yet. See <strong>backend/CRM_PATCH_NOTES.md</strong> for the routes to add.
          Once added, this panel populates automatically — no frontend changes needed.
        </p>
      </div>
    </div>
  );
}
