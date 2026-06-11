/**
 * DispatchModal — the "send it" screen, built for speed.
 *
 * Staff book the ride themselves (Uber / Bolt / inDrive / a rider / a
 * park carrier), then enter just what matters here:
 *   1. who's carrying it  → one tap on a chip, or type any name
 *   2. driver name + phone
 *   3. optional booking ref / waybill and fee
 *
 * On confirm we dispatch, and the customer is emailed the dispatch
 * notice + proof-of-delivery signing link automatically.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Rocket, Mail, MapPin, AlertTriangle } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { dispatchDelivery } from "@services/logistics";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { Delivery } from "@typedefs/logistics";

const COURIER_CHIPS = ["Uber", "Bolt", "inDrive", "Rider", "GIG", "DHL"];

interface Props {
  open: boolean;
  onClose: () => void;
  delivery: Delivery;
  onDispatched?: () => void;
}

export function DispatchModal({ open, onClose, delivery, onDispatched }: Props) {
  const qc = useQueryClient();
  const [company, setCompany] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [waybill, setWaybill] = useState("");
  const [fee, setFee] = useState<number | undefined>(
    Number(delivery.delivery_fee) > 0 ? Number(delivery.delivery_fee) : undefined,
  );

  const addr = delivery.delivery_address ?? ({} as Record<string, string>);
  const addressStr = [addr.line1, addr.area, addr.city, addr.state]
    .filter(Boolean)
    .join(", ");
  const hasEmail = !!delivery.contact_email;

  const mutation = useMutation({
    mutationFn: () =>
      dispatchDelivery(delivery.delivery_id, {
        courier_company: company.trim(),
        driver_name: driverName.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        waybill_number: waybill.trim() || undefined,
        delivery_fee: fee,
      }),
    onSuccess: (res) => {
      showToast.success(
        `${delivery.delivery_number} dispatched`,
        res.customer_emailed
          ? "Customer emailed the signing link."
          : "No email on the customer's contact — share the signing link manually.",
      );
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["delivery", delivery.delivery_id] });
      qc.invalidateQueries({
        queryKey: ["delivery-tracking", delivery.delivery_id],
      });
      onClose();
      onDispatched?.();
    },
    onError: (err) => showToast.error("Could not dispatch", errMsg(err)),
  });

  const canDispatch = company.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Dispatch ${delivery.delivery_number}`}
      size="md"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="gold"
            leftIcon={<Rocket className="w-4 h-4" />}
            loading={mutation.isPending}
            disabled={!canDispatch}
            onClick={() => mutation.mutate()}
          >
            Dispatch & email customer
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Address confirmation */}
        <div className="flex items-start gap-2.5 rounded-xl border border-brand-cloud/40 bg-brand-cream/30 px-4 py-3">
          <MapPin className="h-4 w-4 shrink-0 text-brand-black/60 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-black">
              {delivery.contact_name}
              {delivery.primary_phone ? ` · ${delivery.primary_phone}` : ""}
            </p>
            <p className="text-xs text-brand-black/60 mt-0.5">
              {addressStr || "No address recorded"}
            </p>
          </div>
        </div>

        {/* Who is carrying it */}
        <div>
          <label className="mb-2 block text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
            Who is delivering it? *
          </label>
          <div className="flex flex-wrap gap-2 mb-2.5">
            {COURIER_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCompany(c)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all border",
                  company === c
                    ? "border-brand-accent bg-brand-accent/10 text-brand-black"
                    : "border-brand-cloud/50 text-brand-black/60 hover:border-brand-black/30",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <Input
            surface="light"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Or type any courier / transport company…"
          />
        </div>

        {/* Driver */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            surface="light"
            label="Driver's name"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="e.g. Emeka"
          />
          <Input
            surface="light"
            label="Driver's phone"
            type="tel"
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
            placeholder="080…"
          />
        </div>

        {/* Ref + fee */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            surface="light"
            label="Booking ref / waybill (optional)"
            value={waybill}
            onChange={(e) => setWaybill(e.target.value)}
            placeholder="Trip code, waybill…"
          />
          <NumberField
            surface="light"
            decimal
            label="Delivery fee (₦)"
            placeholder="0.00"
            value={fee}
            onValueChange={setFee}
          />
        </div>

        {/* Email notice */}
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs",
            hasEmail
              ? "bg-brand-accent/5 border border-brand-accent/20 text-brand-black/70"
              : "bg-state-warn/5 border border-state-warn/30 text-state-warn",
          )}
        >
          {hasEmail ? (
            <>
              <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-accent" />
              <p>
                The customer will be emailed the dispatch notice, driver
                details and a link to <strong>sign for the delivery</strong> on
                arrival.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>
                This customer has <strong>no email address</strong> on file —
                they won't get the signing link automatically. Add an email to
                their contact, or have the driver collect a signature from the
                delivery page.
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
