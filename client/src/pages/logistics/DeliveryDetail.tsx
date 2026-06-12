import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Rocket,
  CheckCircle,
  Package,
  MapPin,
  Phone,
  Clock,
  PenLine,
  AlertTriangle,
  Mail,
  Truck,
  FileText,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  DeliveryStatusBadge,
  CourierBadge,
} from "@components/logistics/shared/DeliveryStatusBadge";
import { MarkFailedModal } from "@/components/logistics/modals/MarkFailedModal";
import { DispatchModal } from "@/components/logistics/modals/DispatchModal";
import {
  getDelivery,
  markDelivered,
  getTracking,
  packingSlipUrl,
  updateDeliveryDetails,
  resendSigningLink,
} from "@services/logistics";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDateTime } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

export default function DeliveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [showFailed, setShowFailed] = useState(false);
  const [showReturned, setShowReturned] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [waybill, setWaybill] = useState("");
  const [courierCompany, setCourierCompany] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [editFee, setEditFee] = useState("");

  const { data: delivery, isLoading } = useQuery({
    queryKey: ["delivery", id],
    queryFn: () => getDelivery(id!),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const { data: trackingData = [] } = useQuery({
    queryKey: ["delivery-tracking", id],
    queryFn: () => getTracking(id!),
    enabled: !!id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["delivery", id] });
    qc.invalidateQueries({ queryKey: ["delivery-tracking", id] });
    qc.invalidateQueries({ queryKey: ["deliveries"] });
  };

  const deliveredMutation = useMutation({
    mutationFn: () => markDelivered(id!),
    onSuccess: () => {
      showToast.success("Marked as delivered", "Customer notified by email.");
      refresh();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const resendMutation = useMutation({
    mutationFn: () => resendSigningLink(id!),
    onSuccess: () => {
      showToast.success(
        "Signing link re-sent",
        "A fresh 48-hour link was emailed to the customer.",
      );
      refresh();
    },
    onError: (err) => showToast.error("Could not resend", errMsg(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (fields: {
      waybill_number?: string | null;
      courier_company?: string | null;
      driver_name?: string | null;
      driver_phone?: string | null;
      delivery_fee?: number;
    }) => updateDeliveryDetails(id!, fields),
    onSuccess: () => {
      showToast.success("Delivery details updated");
      refresh();
      setEditMode(false);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function openEditMode() {
    setWaybill(delivery?.waybill_number ?? "");
    setCourierCompany(delivery?.courier_company ?? "");
    setDriverName(delivery?.driver_name ?? "");
    setDriverPhone(delivery?.driver_phone ?? "");
    setEditFee(String(delivery?.delivery_fee ?? 0));
    setEditMode(true);
  }

  function saveDetails() {
    const fields: Record<string, unknown> = {};
    if (waybill !== (delivery?.waybill_number ?? ""))
      fields.waybill_number = waybill || null;
    if (courierCompany !== (delivery?.courier_company ?? ""))
      fields.courier_company = courierCompany || null;
    if (driverName !== (delivery?.driver_name ?? ""))
      fields.driver_name = driverName || null;
    if (driverPhone !== (delivery?.driver_phone ?? ""))
      fields.driver_phone = driverPhone || null;
    const feeNum = parseFloat(editFee) || 0;
    if (feeNum !== parseFloat(String(delivery?.delivery_fee ?? 0)))
      fields.delivery_fee = feeNum;
    if (!Object.keys(fields).length) {
      setEditMode(false);
      return;
    }
    updateMutation.mutate(fields);
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
        <p className="text-brand-smoke">Delivery not found.</p>
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
  const inTransit = ["dispatched", "picked_up", "in_transit"].includes(
    delivery.status,
  );

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={delivery.delivery_number}
        subtitle={`${delivery.contact_name} · ${
          delivery.courier_company || delivery.courier.toUpperCase()
        }`}
        crumbs={[
          { label: "Logistics", to: "/logistics" },
          { label: delivery.delivery_number },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DeliveryStatusBadge status={delivery.status} />
            {!delivery.courier_company && (
              <CourierBadge courier={delivery.courier} />
            )}

            {delivery.status === "pending_dispatch" && (
              <Button size="sm" onClick={() => setShowDispatch(true)}>
                <Rocket className="h-4 w-4" />
                Dispatch
              </Button>
            )}
            {inTransit && (
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
      {inTransit && !isSigned && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-brand-accent/30 bg-brand-accent/5 px-5 py-4">
          <PenLine className="h-5 w-5 shrink-0 text-brand-accent mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-brand-accent">
              Awaiting proof-of-delivery signature
            </p>
            <p className="mt-0.5 text-xs text-brand-accent/70">
              {delivery.contact_email
                ? `The signing link was emailed to ${delivery.contact_email}. On arrival the customer signs, then hands the phone to the driver to counter-sign.`
                : "This customer has no email on file — add one to their contact and resend, or open the signing page from this device for the driver."}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => resendMutation.mutate()}
            loading={resendMutation.isPending}
          >
            <Mail className="h-4 w-4" />
            Resend signing email
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Delivery info */}
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
            Delivery Details
          </p>

          {/* Customer */}
          <div className="flex items-start gap-3">
            <Phone className="h-4 w-4 shrink-0 text-brand-smoke mt-0.5" />
            <div>
              <p className="text-sm font-medium text-brand-cream">
                {delivery.contact_name}
              </p>
              <p className="text-xs text-brand-smoke">
                {delivery.primary_phone}
                {delivery.contact_email ? ` · ${delivery.contact_email}` : ""}
              </p>
            </div>
          </div>

          {/* Address */}
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 shrink-0 text-brand-smoke mt-0.5" />
            <div className="text-sm text-brand-cloud">
              {addr.line1 && <p>{addr.line1}</p>}
              {addr.area && <p>{addr.area}</p>}
              {(addr.city || addr.state) && (
                <p>{[addr.city, addr.state].filter(Boolean).join(", ")}</p>
              )}
              {addr.landmark && (
                <p className="text-xs text-brand-smoke">Near {addr.landmark}</p>
              )}
            </div>
          </div>

          {/* Driver / courier details — editable */}
          {!editMode ? (
            <>
              {(delivery.courier_company ||
                delivery.driver_name ||
                delivery.driver_phone) && (
                <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-brand-graphite/30 px-3 py-2.5">
                  <Truck className="h-4 w-4 shrink-0 text-brand-accent mt-0.5" />
                  <div className="text-sm">
                    <p className="text-brand-cream font-medium">
                      {delivery.courier_company || "Courier"}
                    </p>
                    {(delivery.driver_name || delivery.driver_phone) && (
                      <p className="text-xs text-brand-smoke">
                        {[delivery.driver_name, delivery.driver_phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {delivery.waybill_number && (
                <div className="text-sm">
                  <span className="text-brand-smoke">Waybill / ref: </span>
                  <span className="font-mono text-brand-cream">
                    {delivery.waybill_number}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                <span className="text-brand-smoke">Delivery Fee</span>
                <span className="text-brand-cream tabular-nums">
                  {fmtMoney(delivery.delivery_fee, currency)}
                  {delivery.fee_borne_by !== "customer" && (
                    <span className="ml-1 text-xs text-brand-smoke">
                      (
                      {delivery.fee_borne_by === "business"
                        ? "absorbed"
                        : "split"}
                      )
                    </span>
                  )}
                </span>
              </div>
              {!["delivered", "returned"].includes(delivery.status) && (
                <button
                  type="button"
                  onClick={openEditMode}
                  className="text-xs text-brand-accent hover:underline mt-1"
                >
                  Edit driver / waybill / fee
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3 border-t border-white/5 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-brand-smoke mb-1">
                    Courier company
                  </label>
                  <input
                    value={courierCompany}
                    onChange={(e) => setCourierCompany(e.target.value)}
                    placeholder="Uber, Bolt, GIG…"
                    className="w-full rounded-lg border border-white/10 bg-brand-graphite px-3 py-2 text-sm text-brand-cream placeholder:text-brand-smoke/40 focus:border-brand-accent/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-brand-smoke mb-1">
                    Waybill / booking ref
                  </label>
                  <input
                    value={waybill}
                    onChange={(e) => setWaybill(e.target.value)}
                    placeholder="e.g. GIGL-12345"
                    className="w-full rounded-lg border border-white/10 bg-brand-graphite px-3 py-2 text-sm text-brand-cream placeholder:text-brand-smoke/40 focus:border-brand-accent/50 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-brand-smoke mb-1">
                    Driver name
                  </label>
                  <input
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-brand-graphite px-3 py-2 text-sm text-brand-cream focus:border-brand-accent/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-brand-smoke mb-1">
                    Driver phone
                  </label>
                  <input
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-brand-graphite px-3 py-2 text-sm text-brand-cream focus:border-brand-accent/50 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-brand-smoke mb-1">
                  Delivery Fee (₦)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editFee}
                  onChange={(e) =>
                    setEditFee(e.target.value.replace(/[^\d.]/g, ""))
                  }
                  className="w-full rounded-lg border border-white/10 bg-brand-graphite px-3 py-2 text-sm text-brand-cream focus:border-brand-accent/50 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={saveDetails}
                  loading={updateMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditMode(false)}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Timestamps */}
          {delivery.dispatched_at && (
            <div className="text-xs text-brand-smoke flex items-center gap-1.5">
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
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
            Items
          </p>
          {(delivery.items ?? []).map((item) => (
            <div
              key={item.item_id}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-brand-cream">{item.description}</span>
              <span className="text-brand-smoke">× {item.quantity}</span>
            </div>
          ))}
          {(!delivery.items || delivery.items.length === 0) && (
            <p className="text-sm text-brand-smoke">No items recorded</p>
          )}
        </div>
      </div>

      {/* Signatures — shown when delivery is signed */}
      {isSigned && hasBothSigs && (
        <div className="rounded-2xl border border-green-500/20 bg-brand-charcoal p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <p className="text-sm font-semibold text-green-400">
              Proof of Delivery — Signed
            </p>
            {delivery.signed_at && (
              <span className="ml-auto text-xs text-brand-smoke">
                {fmtDateTime(delivery.signed_at)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-xs text-brand-smoke">
                Customer
                {delivery.customer_signed_name
                  ? ` — ${delivery.customer_signed_name}`
                  : ""}
              </p>
              <img
                src={delivery.customer_signature!}
                alt="Customer signature"
                className="rounded-lg border border-white/10 bg-white w-full max-h-28 object-contain"
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-brand-smoke">
                Driver
                {delivery.driver_signed_name
                  ? ` — ${delivery.driver_signed_name}`
                  : ""}
              </p>
              <img
                src={delivery.driver_signature!}
                alt="Driver signature"
                className="rounded-lg border border-white/10 bg-white w-full max-h-28 object-contain"
              />
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-brand-smoke">
            <FileText className="h-3.5 w-3.5" />
            The signed delivery note was emailed to the customer and archived
            in Documents.
          </p>
        </div>
      )}

      {/* Tracking timeline */}
      {trackingData.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
            Tracking
          </p>
          <ol className="relative border-l border-white/10 space-y-4 pl-5">
            {trackingData.map((entry) => (
              <li key={entry.track_id ?? entry.tracking_id} className="relative">
                <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border border-white/20 bg-brand-graphite" />
                <p className="text-sm font-medium text-brand-cream">
                  {entry.message}
                </p>
                <p className="text-xs text-brand-smoke">
                  {fmtDateTime(entry.occurred_at)}
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
      <DispatchModal
        open={showDispatch}
        onClose={() => setShowDispatch(false)}
        delivery={delivery}
      />
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
