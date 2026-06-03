import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Check,
  Clock,
  Package,
  Truck,
  Store,
  X,
  Upload,
  RefreshCw,
} from "lucide-react";
import {
  getOrderTracking,
  submitProofOfPayment,
} from "@services/salesCampaign";
import { fmtMoney, fmtDateTime } from "@lib/format";
import type { OrderTracking } from "@typedefs/salesCampaign";
import { ORDER_STATUS_META } from "@lib/constants/salesCampaignConstants";
import { cn } from "@lib/cn";

const STATUS_STEPS = [
  { key: "pending", icon: Clock, label: "Awaiting payment proof" },
  { key: "proof_submitted", icon: Upload, label: "Verifying payment" },
  { key: "confirmed", icon: Check, label: "Order confirmed" },
  { key: "dispatched", icon: Truck, label: "Dispatched" },
  { key: "ready_for_pickup", icon: Store, label: "Ready for pickup" },
  { key: "completed", icon: Package, label: "Completed" },
];
const PICKUP_STEPS = [
  "pending",
  "proof_submitted",
  "confirmed",
  "ready_for_pickup",
  "completed",
];

export default function OrderTrackingPage() {
  const { business, token } = useParams<{ business: string; token: string }>();

  const [order, setOrder] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Proof upload state (for pending orders)
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofDone, setProofDone] = useState(false);

  async function fetchOrder() {
    if (!business || !token) return;
    try {
      const data = await getOrderTracking(business, token);
      setOrder(data);
      setError(null);
    } catch {
      setError("Order not found. Check your tracking link.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchOrder();
  }, [business, token]);

  // Auto-refresh every 30s if order is in a transitional state
  useEffect(() => {
    if (!order) return;
    if (["proof_submitted", "dispatched"].includes(order.status)) {
      const iv = setInterval(fetchOrder, 30_000);
      return () => clearInterval(iv);
    }
  }, [order?.status]);

  async function submitProof() {
    if (!business || !token) return;
    setProofError(null);
    setSubmitting(true);
    try {
      let url = proofUrl;
      if (proofFile && !url) {
        const formData = new FormData();
        formData.append("file", proofFile);
        const res = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        url = json.url;
      }
      if (!url) {
        setProofError("Please upload a file or enter a URL.");
        return;
      }

      // We need the order_id — but tracking only returns safe fields.
      // We'll look it up via a dedicated endpoint.
      const lookupRes = await fetch(
        `/api/c/track/${business}/${token}/order-id`,
      );
      const { order_id } = await lookupRes.json();

      await submitProofOfPayment(order_id, business, url);
      setProofDone(true);
      await fetchOrder();
    } catch (e: any) {
      setProofError(
        e?.response?.data?.message ?? "Submission failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-[#C9A86C] border-t-transparent rounded-full" />
      </div>
    );

  if (error || !order)
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 text-center">
        <X className="h-10 w-10 text-red-400 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Order Not Found</h1>
        <p className="text-gray-400 text-sm">
          {error ?? "Invalid tracking link."}
        </p>
      </div>
    );

  const isCancelled = order.status === "cancelled";
  const isPickup = order.fulfilment_type === "pickup";
  const steps = isPickup
    ? STATUS_STEPS.filter((s) => PICKUP_STEPS.includes(s.key))
    : STATUS_STEPS.filter((s) => s.key !== "ready_for_pickup");

  const currentStepIdx = steps.findIndex((s) => s.key === order.status);
  const statusMeta = ORDER_STATUS_META[order.status] ?? {
    label: order.status,
    color: "#888",
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-white/8 px-4 py-5 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
          Order Tracking
        </p>
        <p className="font-mono text-[#C9A86C] text-xl font-bold">
          {order.order_number}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        {/* Status badge */}
        <div className="text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold border"
            style={{
              color: statusMeta.color,
              borderColor: statusMeta.color + "40",
              background: statusMeta.color + "15",
            }}
          >
            {statusMeta.label}
          </div>
          <p className="text-gray-400 text-sm mt-3 max-w-sm mx-auto">
            {order.status_message}
          </p>
        </div>

        {/* Progress steps */}
        {!isCancelled && (
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-white/10" />
            <div className="space-y-4">
              {steps.map((step, i) => {
                const isPast = i < currentStepIdx;
                const isCurrent = i === currentStepIdx;
                const Icon = step.icon;
                return (
                  <div
                    key={step.key}
                    className="flex items-center gap-4 relative"
                  >
                    <div
                      className={cn(
                        "relative z-10 h-10 w-10 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                        isPast ? "bg-green-500/20 border-green-500/60" : "",
                        isCurrent ? "bg-[#C9A86C]/20 border-[#C9A86C]" : "",
                        !isPast && !isCurrent
                          ? "bg-white/5 border-white/15"
                          : "",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          isPast
                            ? "text-green-400"
                            : isCurrent
                              ? "text-[#C9A86C]"
                              : "text-gray-600",
                        )}
                      />
                    </div>
                    <div>
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isCurrent
                            ? "text-white"
                            : isPast
                              ? "text-gray-400"
                              : "text-gray-600",
                        )}
                      >
                        {step.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cancelled notice */}
        {isCancelled && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4">
            <div className="flex items-center gap-3 mb-1">
              <X className="h-5 w-5 text-red-400" />
              <p className="font-semibold text-red-300">Order Cancelled</p>
            </div>
            <p className="text-sm text-red-400/80">{order.status_message}</p>
          </div>
        )}

        {/* Pickup location */}
        {isPickup &&
          order.pickup_location &&
          ["confirmed", "ready_for_pickup"].includes(order.status) && (
            <div className="rounded-2xl border border-white/8 bg-white/5 px-5 py-4">
              <div className="flex items-center gap-3 mb-2">
                <Store className="h-5 w-5 text-[#C9A86C]" />
                <p className="font-semibold text-white">Pickup Location</p>
              </div>
              <p className="text-sm text-gray-300">{order.pickup_location}</p>
            </div>
          )}

        {/* Order items */}
        <div className="rounded-2xl border border-white/8 bg-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8">
            <p className="text-sm font-semibold text-gray-300">Items Ordered</p>
          </div>
          <div className="divide-y divide-white/5">
            {(order.items ?? []).map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="text-sm text-white">{item.product_name}</p>
                  <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold text-[#C9A86C]">
                  {fmtMoney(item.line_total)}
                </p>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 border-t border-white/8 flex justify-between items-center">
            <span className="text-sm text-gray-400">Total</span>
            <span className="text-lg font-bold text-white">
              {fmtMoney(order.total_amount)}
            </span>
          </div>
        </div>

        {/* Proof upload — only if still pending */}
        {order.status === "pending" && !proofDone && (
          <div className="rounded-2xl border border-[#C9A86C]/20 bg-[#C9A86C]/5 p-5 space-y-4">
            <p className="font-semibold text-[#C9A86C]">
              Upload Your Payment Receipt
            </p>
            <p className="text-sm text-gray-400">
              Already transferred? Upload your bank receipt so we can confirm
              your order.
            </p>

            <label className="block rounded-xl border border-dashed border-white/15 hover:border-[#C9A86C]/30 transition-colors p-6 text-center cursor-pointer">
              <Upload className="h-6 w-6 text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {proofFile ? proofFile.name : "Click to upload receipt"}
              </p>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setProofFile(f);
                }}
              />
            </label>

            <input
              type="url"
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="Or paste screenshot URL here"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A86C]/60"
            />

            {proofError && <p className="text-sm text-red-400">{proofError}</p>}

            <button
              disabled={submitting || (!proofFile && !proofUrl)}
              onClick={submitProof}
              className="w-full bg-[#C9A86C] hover:brightness-110 disabled:opacity-40 text-black font-bold py-3 rounded-full transition-colors text-sm"
            >
              {submitting ? "Submitting…" : "Submit Payment Proof"}
            </button>
          </div>
        )}

        {proofDone && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4 text-center">
            <Check className="h-8 w-8 text-green-400 mx-auto mb-2" />
            <p className="font-semibold text-green-300">Receipt submitted!</p>
            <p className="text-sm text-gray-400 mt-1">
              We're verifying your payment. This page will update automatically.
            </p>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-col gap-3 pb-8">
          <button
            onClick={() => {
              setRefreshing(true);
              fetchOrder();
            }}
            disabled={refreshing}
            className="flex items-center justify-center gap-2 border border-white/15 text-gray-300 hover:bg-white/5 font-medium py-3 rounded-full transition-colors text-sm"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
            {refreshing ? "Refreshing…" : "Refresh Status"}
          </button>
          <p className="text-center text-xs text-gray-600">
            Ordered on {fmtDateTime(order.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}
