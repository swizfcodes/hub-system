import { Link } from 'react-router-dom';
import { Package, ArrowUpRight, Sparkles } from 'lucide-react';
import { EmptyState } from '@components/ui/EmptyState';
import { Button } from '@components/ui/Button';

/**
 * Items / Quotations panel on the deal page.
 *
 * Backend status: per the schema review, deal-level line items live in
 * quotations (Sales module). A quotation can be issued against a deal
 * to formalise the line items, then confirmed to become a sales order.
 *
 * For now we render an actionable placeholder. When the Sales module
 * frontend ships, this becomes a list of quotations attached to the
 * deal (we'll need a `crm_deal_id` column on quotations to query —
 * flagged in backend/CRM_PATCH_NOTES.md).
 */
export function DealItems({ dealId, contactId }: { dealId: string; contactId: string }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold inline-flex items-center gap-2">
        <Package className="w-3.5 h-3.5" /> Items & Quotations
      </h3>

      <div className="rounded-2xl border border-orika-gold/20 bg-orika-gold/[0.03] p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orika-gold/15 text-orika-gold flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-orika-cream">
              Line items on a deal are tracked through <strong>quotations</strong> in the Sales module.
              Issue a quotation to lock-in the items, total, and validity period — confirm it later to convert this deal into a sales order.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link to={`/sales/quotations/new?deal_id=${dealId}&contact_id=${contactId}`}>
                <Button variant="gold" size="sm">Create quotation</Button>
              </Link>
              <Link to={`/sales/quotations?contact_id=${contactId}`} className="inline-flex items-center gap-1 text-xs text-orika-smoke hover:text-orika-cream transition-colors">
                View this contact's quotations <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <p className="text-[0.65rem] text-orika-smoke mt-3">
              <strong>Backend note:</strong> attaching quotations to a specific deal requires adding a
              <code className="mx-1 px-1.5 py-0.5 rounded bg-orika-black/40 font-mono text-orika-gold">crm_deal_id</code>
              column on the quotations table. This panel will surface them automatically once that's done.
            </p>
          </div>
        </div>
      </div>

      <EmptyState
        icon={<Package className="w-6 h-6" />}
        title="No quotations yet"
        description="Create the first quotation for this deal once the Sales module is wired."
      />
    </div>
  );
}
