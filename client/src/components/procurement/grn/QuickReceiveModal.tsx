/**
 * QuickReceiveModal — one-click "receive everything" for the quick purchase path.
 *
 * Accepts all open lines at full ordered quantity with no rejections.
 * Only asks for a receiving location. Calls the same POST /receive endpoint
 * as the full GRN modal.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Zap } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Select } from "@components/ui/Select";
import { receiveGoods } from "@services/purchasing/purchaseOrders";
import { listLocations } from "@services/catalogue/locations";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { PurchaseOrder } from "@typedefs/purchasing";
import { fmtMoney } from "@lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrder;
  /** Fired after a successful receipt — used to chain into billing. */
  onReceived?: () => void;
}

export function QuickReceiveModal({ open, onClose, po, onReceived }: Props) {
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState("");

  const { data: locations = [] } = useQuery({
    queryKey: ["catalogue", "locations"],
    queryFn: () => listLocations(false),
  });
  const warehouses = locations.filter(
    (l) =>
      l.location_type === "warehouse" ||
      l.location_type === "showroom" ||
      l.location_type === "retail" ||
      l.location_type === "pos_terminal",
  );

  const openLines = (po.lines ?? []).filter(
    (l) => l.quantity_received < l.quantity_ordered,
  );

  const totalUnits = openLines.reduce(
    (s, l) => s + (l.quantity_ordered - l.quantity_received),
    0,
  );

  const mutation = useMutation({
    mutationFn: () =>
      receiveGoods(po.po_id, {
        receiving_location_id: locationId || undefined,
        lines: openLines.map((l) => {
          const qty = l.quantity_ordered - l.quantity_received;
          return {
            po_line_id: l.line_id,
            quantity_received: qty,
            quantity_accepted: qty,
            quantity_rejected: 0,
          };
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchasing", "po", po.po_id] });
      qc.invalidateQueries({ queryKey: ["purchasing", "purchase-orders"] });
      showToast.success("All goods received", "Stock updated automatically.");
      setLocationId("");
      onClose();
      onReceived?.();
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  if (openLines.length === 0) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        surface="light"
        size="sm"
        title="Nothing to receive"
        footer={<Button variant="primary" onClick={onClose}>OK</Button>}
      >
        <p className="text-sm text-brand-black/80">
          All lines on this PO have already been fully received.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      surface="light"
      size="md"
      title="Receive all goods at once"
      description="Marks every open line as fully received and accepted. Use this when goods arrive as ordered with no issues."
      footer={
        <>
          <Button variant="outline-light" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            leftIcon={<ArrowDownToLine className="w-4 h-4" />}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Confirm receipt
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="rounded-xl border border-brand-cloud/40 bg-white/40 divide-y divide-brand-cloud/30">
          {openLines.map((l) => (
            <div key={l.line_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-brand-black font-medium truncate mr-4">
                {l.product_name ?? "Product"}
              </span>
              <span className="text-text-on-light-muted shrink-0 tabular-nums">
                {l.quantity_ordered - l.quantity_received} units ·{" "}
                {fmtMoney(
                  (l.quantity_ordered - l.quantity_received) * Number(l.unit_price ?? 0),
                  po.currency,
                )}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5 text-sm font-semibold bg-brand-cream/20">
            <span className="text-brand-black">Total</span>
            <span className="text-brand-black tabular-nums">{totalUnits} units</span>
          </div>
        </div>

        {/* Location */}
        <Select
          label="Receiving location (optional)"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          placeholder="Default warehouse"
          options={warehouses.map((l) => ({ value: l.location_id, label: l.name }))}
        />

        <div className="flex items-start gap-2 rounded-lg bg-brand-accent/5 border border-brand-accent/20 px-3 py-2.5 text-xs text-brand-black/70">
          <Zap className="w-3.5 h-3.5 text-brand-accent mt-0.5 shrink-0" />
          <p>
            All lines will be accepted in full. If some items are damaged or
            short, use{" "}
            <strong>Receive goods</strong> instead for per-line QC.
          </p>
        </div>
      </div>
    </Modal>
  );
}
