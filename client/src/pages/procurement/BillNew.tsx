import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, AlertTriangle, Check } from 'lucide-react';
import { Topbar } from '@components/shell/Topbar';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Skeleton } from '@components/ui/Skeleton';
import { getPO } from '@services/purchasing/purchaseOrders';
import { fmtMoney } from '@lib/format';

/**
 * Side-by-side 3-way match design (Q9 answer C — both auto + manual).
 * Currently the backend doesn't expose bill creation/matching, so this
 * page is a thoughtful preview showing the UX. Once endpoints land it
 * becomes interactive.
 */
export default function BillNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const poId = params.get('po_id') ?? '';

  const { data: po, isLoading } = useQuery({ queryKey: ['purchasing', 'po', poId], queryFn: () => getPO(poId), enabled: !!poId });

  return (
    <>
      <Topbar title="New supplier bill" subtitle="3-way match" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <Breadcrumbs items={[{ label: 'Hub', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Bills', to: '/procurement/bills' }, { label: 'New' }]} />
          <Button variant="ghost" size="sm" leftIcon={<ChevronLeft className="w-4 h-4" />} onClick={() => navigate('/procurement/bills')}>Cancel</Button>
        </div>

        <header className="mb-6">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-orika-gold mb-2">Supplier bill · 3-way match</p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-orika-cream">Match <span className="italic text-orika-gold">PO + GRN + Bill</span></h1>
        </header>

        {isLoading ? <Skeleton className="h-96" /> : !po ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-orika-smoke">Open a PO and click "Match supplier bill" to land here with the PO pre-attached.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="px-5 py-3 border-b border-orika-graphite">
              <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold">PO {po.po_number} · {po.supplier_name}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-orika-charcoal border-b border-orika-graphite">
                  <tr>
                    <th className="px-4 py-2 text-left text-[0.6rem] tracking-widest uppercase text-orika-smoke">Product</th>
                    <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-orika-smoke">PO qty</th>
                    <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-orika-smoke">GRN qty</th>
                    <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-orika-smoke">Bill qty</th>
                    <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-orika-smoke">PO price</th>
                    <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-orika-smoke">Bill price</th>
                    <th className="px-4 py-2 text-center text-[0.6rem] tracking-widest uppercase text-orika-smoke">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {(po.lines ?? []).map((l) => {
                    const qtyMatch = l.quantity_received === l.quantity_ordered;
                    return (
                      <tr key={l.line_id} className="border-b border-orika-graphite/40">
                        <td className="px-4 py-2.5 text-orika-cream">{l.product_name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right text-orika-cream">{l.quantity_ordered}</td>
                        <td className="px-4 py-2.5 text-right text-orika-cream">{l.quantity_received ?? 0}</td>
                        <td className="px-4 py-2.5 text-right text-orika-smoke italic">—</td>
                        <td className="px-4 py-2.5 text-right font-mono text-orika-cream">{fmtMoney(l.unit_price, po.currency)}</td>
                        <td className="px-4 py-2.5 text-right text-orika-smoke italic">—</td>
                        <td className="px-4 py-2.5 text-center">
                          {qtyMatch ? <span className="inline-flex items-center gap-1 text-living-sage text-xs"><Check className="w-3 h-3" /> qty</span>
                            : <span className="inline-flex items-center gap-1 text-state-warn text-xs"><AlertTriangle className="w-3 h-3" /> partial</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4 border-t border-orika-graphite text-xs text-orika-smoke">
              Auto-tolerance: ±5% on quantity, ±2% on price. Exceptions are flagged for manual review.
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
