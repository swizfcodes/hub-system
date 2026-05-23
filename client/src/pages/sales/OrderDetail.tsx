import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Truck, ExternalLink } from 'lucide-react';
import { PageHeader } from '@components/ui/PageHeader';
import { Button } from '@components/ui/Button';
import { Skeleton } from '@components/ui/Skeleton';
import { SalesStatusBadge } from '@components/sales/shared/SalesStatusBadge';
import { LineItemsTable } from '@components/sales/shared/LineItemsTable';
import { HandToLogisticsModal } from '@components/sales/modals/SalesModals';
import { getOrder, generateInvoice } from '@services/sales/orders';
import { fmtDate, fmtMoney } from '@lib/format';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { FULFILMENT_LABELS } from '@lib/constants/salesConstants';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function OrderDetail() {
  const { id }        = useParams<{ id: string }>();
  const navigate      = useNavigate();
  const qc            = useQueryClient();
  const { currency }  = useActiveBusiness();

  const [showLogistics, setShowLogistics] = useState(false);
  const [invoiceDueDate, setInvoiceDueDate] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn:  () => getOrder(id!),
    enabled:  !!id,
  });

  const invoiceMutation = useMutation({
    mutationFn: () => {
      if (!invoiceDueDate) throw new Error('Set a due date for the invoice');
      return generateInvoice(id!, { due_date: invoiceDueDate });
    },
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      showToast.success(`Invoice ${inv.invoice_number} generated`);
      navigate(`/sales/invoices/${inv.invoice_id}`);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto text-center">
        <p className="text-orika-smoke">Order not found.</p>
      </div>
    );
  }

  const hasInvoice       = !!order.invoice_id;
  const isDelivery       = order.fulfilment_type === 'delivery';
  const canHandToLogistics = isDelivery && order.status === 'confirmed';
  const canGenerateInvoice = !hasInvoice && order.status !== 'cancelled';

  return (
    <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={order.order_number}
        subtitle={`${order.contact_name ?? ''} · ${FULFILMENT_LABELS[order.fulfilment_type]} · ${fmtDate(order.created_at)}`}
        crumbs={[
          { label: 'Hub', to: '/' },
          { label: 'Sales', to: '/sales' },
          { label: 'Orders', to: '/sales' },
          { label: order.order_number },
        ]}
        actions={<SalesStatusBadge entity="order" status={order.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left */}
        <div className="space-y-6">
          {/* Order meta */}
          <div className="rounded-xl border border-white/5 bg-orika-charcoal p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-orika-smoke">
              Order Details
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <MetaField label="Customer"    value={order.contact_name ?? '—'} />
              <MetaField label="Fulfilment"  value={FULFILMENT_LABELS[order.fulfilment_type]} />
              <MetaField label="Quote Ref"   value={order.quotation_number ?? '—'} />
              <MetaField label="Created"     value={fmtDate(order.created_at)} />
              <MetaField label="Total"       value={fmtMoney(order.total_amount, currency)} />
              <MetaField
                label="Outstanding"
                value={fmtMoney(order.amount_outstanding, currency)}
                highlight={order.amount_outstanding > 0}
              />
            </div>
          </div>

          {/* Lines */}
          {order.lines && order.lines.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-orika-charcoal p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-orika-smoke">
                Line Items
              </h2>
              <LineItemsTable
                lines={order.lines}
                totals={{
                  subtotal:       order.total_amount,
                  discount_total: 0,
                  vat_amount:     0,
                  total_amount:   order.total_amount,
                }}
                currency={currency}
                compact
              />
            </div>
          )}

          {/* Invoice section */}
          <div className="rounded-xl border border-white/5 bg-orika-charcoal p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">
                Invoice
              </h2>
              {hasInvoice && (
                <SalesStatusBadge
                  entity="invoice"
                  status={order.invoice_status ?? 'draft'}
                  size="sm"
                />
              )}
            </div>

            {hasInvoice ? (
              <a
                href={`/sales/invoices/${order.invoice_id}`}
                className="flex items-center gap-2 text-sm text-orika-gold hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                {order.invoice_number}
              </a>
            ) : canGenerateInvoice ? (
              <div className="flex items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs text-orika-smoke">Invoice Due Date</label>
                  <input
                    type="date"
                    value={invoiceDueDate}
                    onChange={(e) => setInvoiceDueDate(e.target.value)}
                    className="rounded-lg border border-white/10 bg-orika-graphite px-3 py-2 text-sm text-orika-cream focus:border-orika-gold/50 focus:outline-none"
                  />
                </div>
                <Button
                  onClick={() => invoiceMutation.mutate()}
                  loading={invoiceMutation.isPending}
                  disabled={!invoiceDueDate}
                  size="sm"
                >
                  <FileText className="h-4 w-4" />
                  Generate Invoice
                </Button>
              </div>
            ) : (
              <p className="text-sm text-orika-smoke">
                Invoice cannot be generated for this order status.
              </p>
            )}
          </div>
        </div>

        {/* Right — actions rail */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Payment summary */}
          <div className="rounded-xl border border-white/5 bg-orika-charcoal p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">
              Payment
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-orika-smoke">Total</span>
                <span className="font-medium text-orika-cream">
                  {fmtMoney(order.total_amount, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-orika-smoke">Paid</span>
                <span className="font-medium text-green-400">
                  {fmtMoney(order.amount_paid, currency)}
                </span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2">
                <span className="text-orika-smoke">Outstanding</span>
                <span
                  className={
                    order.amount_outstanding > 0 ? 'font-semibold text-amber-400' : 'font-medium text-orika-smoke'
                  }
                >
                  {fmtMoney(order.amount_outstanding, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-xl border border-white/5 bg-orika-charcoal p-4 space-y-2">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-orika-smoke">
              Actions
            </h3>

            {canHandToLogistics && (
              <Button
                className="w-full justify-start"
                onClick={() => setShowLogistics(true)}
              >
                <Truck className="h-4 w-4" />
                Hand to Logistics
              </Button>
            )}

            {order.quotation_id && (
              <a
                href={`/sales/quotations/${order.quotation_id}`}
                className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-orika-cloud hover:border-orika-gold/30 hover:text-orika-gold transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Source Quotation
              </a>
            )}
          </div>
        </div>
      </div>

      {showLogistics && (
        <HandToLogisticsModal
          open={showLogistics}
          onClose={() => setShowLogistics(false)}
          orderId={order.order_id}
          orderNumber={order.order_number}
          contactPhone={order.primary_phone ?? ''}
          onDispatched={() => setShowLogistics(false)}
        />
      )}
    </div>
  );
}

function MetaField({
  label,
  value,
  highlight = false,
}: {
  label:      string;
  value:      string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-orika-smoke">{label}</dt>
      <dd className={`mt-0.5 font-medium truncate ${highlight ? 'text-amber-400' : 'text-orika-cream'}`}>
        {value}
      </dd>
    </div>
  );
}
