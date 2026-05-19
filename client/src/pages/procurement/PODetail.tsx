import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, FileText, Truck, Receipt, ArrowDownToLine, Building2 } from 'lucide-react';
import { Topbar } from '@components/shell/Topbar';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { Skeleton } from '@components/ui/Skeleton';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { getPO } from '@services/purchasing/pos';
import { fmtDate, fmtDateTime, fmtMoney } from '@lib/format';
import { ReceiveGoodsModal } from '@components/procurement/grn/ReceiveGoodsModal';
import type { POStatus } from '@typedefs/purchasing';

const STATUS_TONE: Record<POStatus, 'gold' | 'sage' | 'rose' | 'neutral' | 'danger'> = {
  draft: 'neutral', sent: 'gold', acknowledged: 'gold', partially_received: 'sage',
  received: 'sage', invoiced: 'gold', paid: 'sage', cancelled: 'danger',
};

export default function PODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [receiving, setReceiving] = useState(false);

  const { data: po, isLoading } = useQuery({ queryKey: ['purchasing', 'po', id], queryFn: () => getPO(id!), enabled: !!id });

  const isReceivable = po && ['sent', 'acknowledged', 'partially_received'].includes(po.status);
  const totalReceived = po?.lines?.reduce((s, l) => s + (l.quantity_received ?? 0), 0) ?? 0;
  const totalOrdered  = po?.lines?.reduce((s, l) => s + (l.quantity_ordered ?? 0), 0) ?? 0;

  return (
    <>
      <Topbar title={po?.po_number || 'Purchase Order'} subtitle={po?.supplier_name} />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs items={[{ label: 'Hub', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'POs', to: '/procurement/purchase-orders' }, { label: po?.po_number ?? '…' }]} />
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/procurement/purchase-orders')}>Back</Button>
        </div>

        {isLoading || !po ? (
          <div className="space-y-3"><Skeleton className="h-44" /><Skeleton className="h-64" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 lg:gap-8 items-start">
            <main className="space-y-6 min-w-0">
              {/* Lines */}
              <Card className="overflow-hidden">
                <div className="px-5 py-3 border-b border-orika-graphite flex items-center justify-between">
                  <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold inline-flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Line items</h3>
                  <span className="text-[0.65rem] text-orika-smoke">{totalReceived}/{totalOrdered} units received</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-orika-charcoal border-b border-orika-graphite">
                      <tr>
                        <th className="px-4 py-2 text-left text-[0.6rem] tracking-widest uppercase text-orika-smoke">Product</th>
                        <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-orika-smoke">Qty ordered</th>
                        <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-orika-smoke">Qty received</th>
                        <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-orika-smoke">Unit price</th>
                        <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-orika-smoke">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(po.lines ?? []).map((l) => {
                        const remaining = l.quantity_ordered - (l.quantity_received ?? 0);
                        return (
                          <tr key={l.line_id} className="border-b border-orika-graphite/40">
                            <td className="px-4 py-2.5">
                              <div className="text-orika-cream">{l.product_name ?? '—'}</div>
                              {l.product_sku && <div className="text-[0.6rem] font-mono text-orika-smoke">{l.product_sku}</div>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-orika-cream">{l.quantity_ordered}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="text-orika-cream">{l.quantity_received ?? 0}</span>
                              {remaining > 0 && <span className="text-[0.6rem] text-state-warn ml-1">· {remaining} pending</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-orika-cream">{fmtMoney(l.unit_price, po.currency)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-orika-gold">{fmtMoney(l.line_total, po.currency)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Receipts placeholder - we know GRN exists but GET endpoint not exposed */}
              <Card className="p-5">
                <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold mb-3 inline-flex items-center gap-2"><Truck className="w-3.5 h-3.5" /> Goods receipts</h3>
                <p className="text-xs text-orika-cloud">{po.status === 'received' ? 'All ordered goods have been received.' : po.status === 'partially_received' ? 'Some goods received; rest pending.' : 'No goods received yet.'}</p>
                <p className="text-[0.65rem] text-orika-smoke mt-2">
                  <strong>Backend pending:</strong> a per-PO GRN list endpoint is needed to surface individual receipts here.
                </p>
              </Card>

              {po.notes && (
                <Card className="p-5">
                  <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold mb-2">Notes</h3>
                  <p className="text-sm text-orika-cloud whitespace-pre-line">{po.notes}</p>
                </Card>
              )}
            </main>

            {/* Sticky sidebar */}
            <aside className="lg:sticky lg:top-24 space-y-3">
              <Card className="p-4">
                <div className="text-[0.6rem] uppercase tracking-widest text-orika-smoke mb-1">Status</div>
                <Badge tone={STATUS_TONE[po.status]} size="sm" dot>{po.status.replace('_', ' ')}</Badge>
              </Card>

              <Card className="p-4">
                <Link to={`/procurement/suppliers/${po.supplier_id}`} className="flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-lg bg-living-sage/15 text-living-sage flex items-center justify-center"><Building2 className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-orika-cream truncate group-hover:text-orika-gold">{po.supplier_name}</div>
                    <span className="text-[0.6rem] text-orika-smoke">Open supplier</span>
                  </div>
                </Link>
              </Card>

              <Card className="p-4">
                <div className="text-[0.6rem] uppercase tracking-widest text-orika-smoke">Total</div>
                <div className="text-2xl font-display text-orika-gold tabular-nums">{fmtMoney(po.total_amount, po.currency)}</div>
                {po.ngn_equivalent && po.currency !== 'NGN' && (
                  <div className="text-[0.65rem] text-orika-smoke font-mono mt-1">≈ {fmtMoney(po.ngn_equivalent, 'NGN')} @ {po.exchange_rate}</div>
                )}
                <div className="border-t border-orika-graphite mt-3 pt-3 space-y-1 text-xs">
                  <div className="flex justify-between text-orika-smoke"><span>Subtotal</span><span className="font-mono text-orika-cream">{fmtMoney(po.subtotal, po.currency)}</span></div>
                  {po.shipping_cost > 0 && <div className="flex justify-between text-orika-smoke"><span>Shipping</span><span className="font-mono text-orika-cream">{fmtMoney(po.shipping_cost, po.currency)}</span></div>}
                  {po.import_duty > 0 && <div className="flex justify-between text-orika-smoke"><span>Duty</span><span className="font-mono text-orika-cream">{fmtMoney(po.import_duty, po.currency)}</span></div>}
                  {po.other_charges > 0 && <div className="flex justify-between text-orika-smoke"><span>Other</span><span className="font-mono text-orika-cream">{fmtMoney(po.other_charges, po.currency)}</span></div>}
                </div>
              </Card>

              <Card className="p-4 space-y-2 text-xs">
                <Row label="Order date"  value={fmtDate(po.order_date)} />
                <Row label="ETA"         value={po.expected_delivery ? fmtDate(po.expected_delivery) : '—'} />
                <Row label="Created"     value={fmtDateTime(po.created_at)} />
                {po.delivery_address && <Row label="Ship to" value={po.delivery_address} />}
              </Card>

              {isReceivable && (
                <Button variant="gold" fullWidth leftIcon={<ArrowDownToLine className="w-4 h-4" />} onClick={() => setReceiving(true)}>
                  Receive goods
                </Button>
              )}
              <Link to={`/procurement/bills/new?po_id=${po.po_id}`}>
                <Button variant="secondary" fullWidth leftIcon={<Receipt className="w-4 h-4" />}>Match supplier bill</Button>
              </Link>
            </aside>

            <ReceiveGoodsModal open={receiving} onClose={() => setReceiving(false)} po={po} />
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-orika-smoke">{label}</span>
      <span className="text-orika-cream truncate ml-2">{value}</span>
    </div>
  );
}
