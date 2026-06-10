import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Rocket,
  CheckCircle,
  Package /*ExternalLink*/,
  MapPin,
  Phone,
  Clock,
  PenLine,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
//import { Badge } from '@components/ui/Badge';
import {
  DeliveryStatusBadge,
  CourierBadge,
} from "@components/logistics/shared/DeliveryStatusBadge";
import { MarkFailedModal } from "@/components/logistics/modals/MarkFailedModal";
import {
  getDelivery,
  dispatchDelivery,
  markDelivered,
  getTracking,
  packingSlipUrl,
  updateDeliveryDetails,
} from "@services/logistics";
//import { COURIER_META } from '@lib/constants/logisticsConstants';
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDateTime } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
//import { cn } from '@lib/cn';

export default function DeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [showFailed, setShowFailed] = useState(false);
  const [showReturned, setShowReturned] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [waybill, setWaybill] = useState("");
  const [courierOrderId, setCourierOrderId] = useState("");
  const [editFee, setEditFee] = useState("");

  const { data: delivery, isLoading } = useQuery({
    queryKey: ["delivery", id],
    queryFn: () => getDelivery(id!),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const { data: trackingData } = useQuery({
    queryKey: ["delivery-tracking", id],
    queryFn: () => getTracking(id!),
    enabled: !!id,
  });

  const dispatchMutation = useMutation({
    mutationFn: () => dispatchDelivery(id!),
    onSuccess: () => {
      showToast.success("Dispatched — signature URL sent via WhatsApp");
      qc.invalidateQueries({ queryKey: ["delivery", id] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const deliveredMutation = useMutation({
    mutationFn: () => markDelivered(id!),
    onSuccess: () => {
      showToast.success("Marked as delivered");
      qc.invalidateQueries({ queryKey: ["delivery", id] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (fields: { waybill_number?: string; courier_order_id?: string; delivery_fee?: number }) =>
      updateDeliveryDetails(id!, fields),
    onSuccess: () => {
      showToast.success("Delivery details updated");
      qc.invalidateQueries({ queryKey: ["delivery", id] });
      qc.invalidateQueries({ queryKey: ["delivery-tracking", id] });
      setEditMode(false);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function openEditMode() {
    setWaybill(delivery?.waybill_number ?? "");
    setCourierOrderId(delivery?.courier_order_id ?? "");
    setEditFee(String(delivery?.delivery_fee ?? 0));
    setEditMode(true);
  }

  function saveDetails() {
    const fields: Record<string, unknown> = {};
    if (waybill !== (delivery?.waybill_number ?? "")) fields.waybill_number = waybill || null;
    if (courierOrderId !== (delivery?.courier_order_id ?? "")) fields.courier_order_id = courierOrderId || null;
    const feeNum = parseFloat(editFee) || 0;
    if (feeNum !== parseFloat(String(delivery?.delivery_fee ?? 0))) fields.delivery_fee = feeNum;
    if (!Object.keys(fields).length) { setEditMode(false); return; }
    updateMutation.mutate(fields as any);
  }

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-orika-smoke">Delivery not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/logistics")}
        >
          Back to Logistics
        </Button>
      </div>
    );
  }

  const addr = delivery.delivery_address;
  const isSigned = !!delivery.signed_at;
  const hasBothSigs =
    !!delivery.customer_signature && !!delivery.driver_signature;

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={delivery.delivery_number}
        subtitle={`${delivery.contact_name} · ${delivery.courier.toUpperCase()}`}
        crumbs={[
          { label: "Logistics", to: "/logistics" },
          { label: delivery.delivery_number },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DeliveryStatusBadge status={delivery.status} />
            <CourierBadge courier={delivery.courier} />

            {delivery.status === "pending_dispatch" && (
              <Button
                size="sm"
                onClick={() => dispatchMutation.mutate()}
                loading={dispatchMutation.isPending}
              >
                <Rocket className="h-4 w-4" />
                Dispatch
              </Button>
            )}
            {["dispatched", "picked_up", "in_transit"].includes(
              delivery.status,
            ) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => deliveredMutation.mutate()}
                loading={deliveredMutation.isPending}
              >
                <CheckCircle className="h-4 w-4" />
                Mark Delivered
              </Button>
            )}
            <a
              href={packingSlipUrl(delivery.delivery_id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary" size="sm">
                <Package className="h-4 w-4" />
                Packing Slip
              </Button>
            </a>
          </div>
        }
      />

      {/* Signature status banner */}
      {delivery.status === "dispatched" && !isSigned && (
        <div className="flex items-start gap-3 rounded-2xl border border-orika-gold/30 bg-orika-gold/5 px-5 py-4">
          <PenLine className="h-5 w-5 shrink-0 text-orika-gold mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orika-gold">
              Awaiting customer signature
            </p>
            <p className="mt-0.5 text-xs text-orika-gold/70">
              WhatsApp signing link was sent to{" "}
              {delivery.whatsapp_number ?? "customer"}. Customer must sign and
              pass phone to driver.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Delivery info */}
        <div className="rounded-2xl border border-white/5 bg-orika-charcoal p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">
            Delivery Details
          </p>

          {/* Customer */}
          <div className="flex items-start gap-3">
            <Phone className="h-4 w-4 shrink-0 text-orika-smoke mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orika-cream">
                {delivery.contact_name}
              </p>
              <p className="text-xs text-orika-smoke">
                {delivery.primary_phone}
              </p>
            </div>
          </div>

          {/* Address */}
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 shrink-0 text-orika-smoke mt-0.5" />
            <div className="text-sm text-orika-cloud">
              {addr.line1 && <p>{addr.line1}</p>}
              {addr.area && <p>{addr.area}</p>}
              {(addr.city || addr.state) && (
                <p>
                  {[addr.city, addr.state].filter(Boolean).join(", ")}
                </p>
              )}
              {addr.landmark && (
                <p className="text-xs text-orika-smoke">Near {addr.landmark}</p>
              )}
            </div>
          </div>

          {/* Courier details & fee — editable */}
          {!editMode ? (
            <>
              {delivery.waybill_number && (
                <div className="text-sm">
                  <span className="text-orika-smoke">Waybill: </span>
                  <span className="font-mono text-orika-cream">{delivery.waybill_number}</span>
                </div>
              )}
              {delivery.courier_order_id && (
                <div className="text-sm">
                  <span className="text-orika-smoke">Courier ID: </span>
                  <span className="font-mono text-orika-cream">{delivery.courier_order_id}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                <span className="text-orika-smoke">Delivery Fee</span>
                <span className="text-orika-cream tabular-nums">
                  {fmtMoney(delivery.delivery_fee, currency)}
                  {delivery.fee_borne_by !== "customer" && (
                    <span className="ml-1 text-xs text-orika-smoke">
                      ({delivery.fee_borne_by === "business" ? "absorbed" : "split"})
                    </span>
                  )}
                </span>
              </div>
              {!["delivered", "returned"].includes(delivery.status) && (
                <button
                  type="button"
                  onClick={openEditMode}
                  className="text-xs text-orika-gold hover:underline mt-1"
                >
                  Edit waybill / fee
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3 border-t border-white/5 pt-3">
              <div>
                <label className="block text-xs text-orika-smoke mb-1">Waybill Number</label>
                <input
                  value={waybill}
                  onChange={(e) => setWaybill(e.target.value)}
                  placeholder="e.g. GIGL-12345"
                  className="w-full rounded-lg border border-white/10 bg-orika-graphite px-3 py-2 text-sm text-orika-cream placeholder:text-orika-smoke/40 focus:border-orika-gold/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-orika-smoke mb-1">Courier Order ID</label>
                <input
                  value={courierOrderId}
                  onChange={(e) => setCourierOrderId(e.target.value)}
                  placeholder="Courier reference"
                  className="w-full rounded-lg border border-white/10 bg-orika-graphite px-3 py-2 text-sm text-orika-cream placeholder:text-orika-smoke/40 focus:border-orika-gold/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-orika-smoke mb-1">Delivery Fee (₦)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={editFee}
                  onChange={(e) => setEditFee(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-orika-graphite px-3 py-2 text-sm text-orika-cream placeholder:text-orika-smoke/40 focus:border-orika-gold/50 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveDetails} loading={updateMutation.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditMode(false)} disabled={updateMutation.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Timestamps */}
          {delivery.dispatched_at && (
            <div className="text-xs text-orika-smoke flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Dispatched: {fmtDateTime(delivery.dispatched_at)}
            </div>
          )}
          {delivery.delivered_at && (
            <div className="text-xs text-green-400 flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3" />
              Delivered: {fmtDateTime(delivery.delivered_at)}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="rounded-2xl border border-white/5 bg-orika-charcoal p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">
            Items
          </p>
          {(delivery.items ?? []).map((item) => (
            <div
              key={item.item_id}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-orika-cream">{item.description}</span>
              <span className="text-orika-smoke">× {item.quantity}</span>
            </div>
          ))}
          {(!delivery.items || delivery.items.length === 0) && (
            <p className="text-sm text-orika-smoke">No items recorded</p>
          )}
        </div>
      </div>

      {/* Signatures — shown when delivery is signed */}
      {isSigned && hasBothSigs && (
        <div className="rounded-2xl border border-green-500/20 bg-orika-charcoal p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <p className="text-sm font-semibold text-green-400">
              Proof of Delivery — Signed
            </p>
            {delivery.signed_at && (
              <span className="ml-auto text-xs text-orika-smoke">
                {fmtDateTime(delivery.signed_at)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-xs text-orika-smoke">
                Customer Signature
              </p>
              <img
                src={delivery.customer_signature!}
                alt="Customer signature"
                className="rounded-lg border border-white/10 bg-white w-full max-h-28 object-contain"
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-orika-smoke">Driver Signature</p>
              <img
                src={delivery.driver_signature!}
                alt="Driver signature"
                className="rounded-lg border border-white/10 bg-white w-full max-h-28 object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tracking timeline */}
      {trackingData && trackingData.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-orika-charcoal p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">
            Tracking
          </p>
          <ol className="relative border-l border-white/10 space-y-4 pl-5">
            {trackingData.map((entry: any) => (
              <li key={entry.track_id} className="relative">
                <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border border-white/20 bg-orika-graphite" />
                <p className="text-sm font-medium text-orika-cream">
                  {entry.message}
                </p>
                <p className="text-xs text-orika-smoke">
                  {fmtDateTime(entry.occurred_at)}
                  {entry.location ? ` · ${entry.location}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Action footer */}
      {!["delivered", "returned"].includes(delivery.status) && (
        <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5">
          {delivery.status !== "pending_dispatch" && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowFailed(true)}
            >
              <AlertTriangle className="h-4 w-4" />
              Mark Failed
            </Button>
          )}
          {delivery.status === "failed" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReturned(true)}
            >
              Mark Returned (Restock)
            </Button>
          )}
        </div>
      )}

      {/* Modals */}
      <MarkFailedModal
        open={showFailed}
        onClose={() => setShowFailed(false)}
        deliveryId={id!}
        mode="failed"
      />
      <MarkFailedModal
        open={showReturned}
        onClose={() => setShowReturned(false)}
        deliveryId={id!}
        mode="returned"
      />
    </div>
  );
}

