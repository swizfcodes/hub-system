import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, AlertTriangle, Check, X } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Select } from '@components/ui/Select';
import { grnSchema, type GRNValues } from '@lib/schemas/purchasing';
import { receiveGoods } from '@services/purchasing/purchaseOrders';
import { listLocations } from '@services/catalogue/locations';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import type { PurchaseOrder } from '@typedefs/purchasing';
import { cn } from '@lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrder;
}

/**
 * Q8 answer C — partial receipts + per-line QC (accept/partial/reject + reason).
 * Calls POST /api/purchasing/purchase-orders/:id/receive which already records
 * stock movements via stockService.recordMovement (we verified in the backend).
 */
export function ReceiveGoodsModal({ open, onClose, po }: Props) {
  const qc = useQueryClient();

  const { data: locations = [] } = useQuery({ queryKey: ['catalogue', 'locations'], queryFn: () => listLocations(false) });
  const warehouses = locations.filter((l) => l.location_type === 'warehouse' || l.location_type === 'showroom');

  const openLines = (po.lines ?? []).filter((l) => l.quantity_received < l.quantity_ordered);

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<GRNValues>({
    resolver: zodResolver(grnSchema),
    defaultValues: {
      warehouse_location_id: '', notes: '',
      lines: openLines.map((l) => ({
        po_line_id: l.line_id,
        quantity_received: l.quantity_ordered - l.quantity_received,
        quantity_accepted: l.quantity_ordered - l.quantity_received,
        quantity_rejected: 0,
        rejection_reason: '',
      })),
    },
  });

  const { fields } = useFieldArray({ control, name: 'lines' });
  const linesWatch = watch('lines');

  useEffect(() => {
    if (open) {
      reset({
        warehouse_location_id: '', notes: '',
        lines: openLines.map((l) => ({
          po_line_id: l.line_id,
          quantity_received: l.quantity_ordered - l.quantity_received,
          quantity_accepted: l.quantity_ordered - l.quantity_received,
          quantity_rejected: 0,
          rejection_reason: '',
        })),
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (v: GRNValues) => receiveGoods(po.po_id, {
      ...v,
      warehouse_location_id: v.warehouse_location_id || undefined,
      notes: v.notes || undefined,
      lines: v.lines.map((l) => ({
        po_line_id: l.po_line_id,
        quantity_received: l.quantity_received,
        quantity_accepted: l.quantity_accepted,
        quantity_rejected: l.quantity_rejected,
        rejection_reason: l.rejection_reason || undefined,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchasing', 'po', po.po_id] });
      qc.invalidateQueries({ queryKey: ['purchasing', 'pos'] });
      showToast.success('Goods received', 'Stock updated automatically.');
      reset(); onClose();
    },
    onError: (e) => showToast.error('Failed', errMsg(e)),
  });

  if (openLines.length === 0) {
    return (
      <Modal open={open} onClose={onClose} surface="light" size="md" title="All received"
        footer={<Button variant="primary" onClick={onClose}>OK</Button>}>
        <p className="text-sm text-orika-black/80">Every line on this PO has been fully received. Nothing more to log.</p>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} surface="light" size="xl"
      title="Receive goods"
      description="Accept or reject each line with a reason. Accepted goods land in stock immediately."
      footer={<>
        <Button variant="outline-light" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button variant="primary" leftIcon={<ArrowDownToLine className="w-4 h-4" />} loading={mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v))}>
          Record receipt
        </Button>
      </>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Select {...register('warehouse_location_id')} label="Receiving location"
            placeholder="Pick a location (optional)"
            options={warehouses.map((l) => ({ value: l.location_id, label: l.name }))} />
          <Textarea {...register('notes')} label="Notes (optional)" rows={1} placeholder="Damaged box on top, otherwise intact…" />
        </div>

        <div className="space-y-3">
          {fields.map((f, i) => {
            const line = openLines[i];
            const w = linesWatch?.[i];
            const isPartial = w && w.quantity_rejected > 0;
            return (
              <div key={f.id} className={cn(
                'rounded-xl border p-3 sm:p-4 transition-colors',
                isPartial ? 'border-state-warn/40 bg-state-warn/[0.05]' : 'border-orika-cloud/40 bg-white/40',
              )}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-orika-black">{line.product_name ?? 'Product'}</div>
                    <div className="text-[0.65rem] font-mono text-text-on-light-muted mt-0.5">{line.product_sku} · Ordered {line.quantity_ordered}, already received {line.quantity_received}</div>
                  </div>
                  <Controller
                    control={control}
                    name={`lines.${i}.po_line_id`}
                    render={({ field }) => <input type="hidden" {...field} />}
                  />
                  <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:min-w-[360px]">
                    <Input {...register(`lines.${i}.quantity_received` as const, { valueAsNumber: true })} type="number" min={0} label="Received" />
                    <Input {...register(`lines.${i}.quantity_accepted` as const, { valueAsNumber: true })} type="number" min={0} label="Accepted" />
                    <Input {...register(`lines.${i}.quantity_rejected` as const, { valueAsNumber: true })} type="number" min={0} label="Rejected" />
                  </div>
                </div>
                {isPartial && (
                  <div className="mt-3 animate-slide-down">
                    <div className="flex items-center gap-1.5 mb-1.5 text-[0.65rem] text-state-warn"><AlertTriangle className="w-3 h-3" /> Reason for rejection</div>
                    <Input {...register(`lines.${i}.rejection_reason` as const)} placeholder="Damaged in transit · Wrong colour · Late · Spec mismatch" />
                  </div>
                )}
                {errors.lines?.[i]?.quantity_received && (
                  <p className="mt-2 text-xs text-state-danger">{errors.lines[i]?.quantity_received?.message}</p>
                )}
                {/* Quick QC chips */}
                <div className="mt-3 flex gap-2 flex-wrap text-xs">
                  <QuickChip label="Accept all"  tone="sage" />
                  <QuickChip label="Reject all"  tone="danger" />
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-orika-cream/40 border border-orika-cloud/40 p-3 flex items-start gap-2 text-xs text-orika-black/70">
          <Check className="w-3.5 h-3.5 text-living-sage mt-0.5 shrink-0" />
          <p>Accepted quantities are added to stock automatically (the receive endpoint records a <code className="font-mono">stock_movements</code> entry per line). Rejected lines stay with the supplier; a Return-to-Vendor doc isn't yet implemented.</p>
        </div>
      </div>
    </Modal>
  );
}

function QuickChip({ label, tone }: { label: string; tone: 'sage' | 'danger' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6rem] uppercase tracking-widest font-medium',
      tone === 'sage' ? 'bg-living-sage/15 text-living-sage' : 'bg-state-danger/15 text-state-danger',
    )}>
      {tone === 'sage' ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
}
