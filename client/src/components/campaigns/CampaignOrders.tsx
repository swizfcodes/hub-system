// ── CampaignOrders.tsx ─────────────────────────────────────────────────────────
// Orders tab content for the Campaign Builder.
// Shows all orders for a campaign with confirm/cancel actions.
// Auto-refreshes every 15 seconds while the tab is open.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag,
  CheckCircle,
  XCircle,
  Clock,
  Truck,
  Package,
  Image,
  Phone,
  Mail,
} from "lucide-react";
import {
  listCampaignOrders,
  confirmOrder,
  cancelOrder,
} from "@services/salesCampaign";
import { fmtMoney, fmtDateTime } from "@lib/format";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Badge } from "@components/ui/Badge";
import { showToast } from "@hooks/useToast";
import { cn } from "@lib/cn";

const STATUS_META: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    icon: <Clock className="h-3 w-3" />,
  },
  proof_submitted: {
    label: "Proof Submitted",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    icon: <Image className="h-3 w-3" />,
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-green-500/15 text-green-400 border-green-500/20",
    icon: <CheckCircle className="h-3 w-3" />,
  },
  dispatched: {
    label: "Dispatched",
    color: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    icon: <Truck className="h-3 w-3" />,
  },
  ready_for_pickup: {
    label: "Ready for Pickup",
    color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
    icon: <Package className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    color: "bg-green-600/15 text-green-300 border-green-600/20",
    icon: <CheckCircle className="h-3 w-3" />,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-500/15 text-red-400 border-red-500/20",
    icon: <XCircle className="h-3 w-3" />,
  },
};

interface Props {
  campaignId: string;
  business: string;
}

export default function CampaignOrders({ campaignId, business: _business }: Props) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cancelModal, setCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [proofModal, setProofModal] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["campaign-orders", campaignId, statusFilter],
    queryFn: () =>
      listCampaignOrders(
        campaignId,
        statusFilter !== "all" ? { status: statusFilter } : undefined,
      ),
    refetchInterval: 15_000,
    staleTime: 8_000,
  });

  interface CampaignOrder {
    order_id: string;
    order_number: string;
    status: string;
    customer_name: string;
    customer_phone: string | null;
    customer_email: string | null;
    fulfilment_type: string;
    payment_method: string;
    total_amount: number;
    proof_image_url: string | null;
    created_at: string;
  }
  const orders = (data?.data ?? []) as CampaignOrder[];

  const confirmMutation = useMutation({
    mutationFn: (orderId: string) => confirmOrder(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-orders", campaignId] });
      showToast.success("Order confirmed", "Customer will be notified.");
    },
    onError: (e: Error) => showToast.error("Failed", e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      cancelOrder(orderId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-orders", campaignId] });
      setCancelModal(null);
      setCancelReason("");
      showToast.success("Order cancelled");
    },
    onError: (e: Error) => showToast.error("Failed", e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-white/5 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const FILTER_OPTIONS = [
    "all",
    "pending",
    "proof_submitted",
    "confirmed",
    "dispatched",
    "ready_for_pickup",
    "completed",
    "cancelled",
  ];

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
              statusFilter === f
                ? "bg-brand-accent/10 text-brand-accent border-brand-accent/30"
                : "text-brand-smoke border-white/10 hover:border-white/20",
            )}
          >
            {f === "all"
              ? "All"
              : (STATUS_META[f]?.label ?? f)}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {!orders.length && (
        <div className="rounded-2xl border border-white/8 bg-brand-graphite p-10 text-center space-y-3">
          <ShoppingBag className="h-10 w-10 text-brand-smoke mx-auto opacity-40" />
          <p className="text-sm text-brand-cloud font-medium">No orders yet</p>
          <p className="text-xs text-brand-smoke">
            Orders will appear here as customers check out.
          </p>
        </div>
      )}

      {/* Order cards */}
      {orders.map((order) => {
        const id = order.order_id as string;
        const status = (order.status as string) || "pending";
        const meta = STATUS_META[status] ?? STATUS_META.pending;
        const proofUrl = order.proof_image_url as string | null;

        return (
          <div
            key={id}
            className="rounded-2xl border border-white/8 bg-brand-graphite p-4 space-y-3"
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-brand-cream">
                    {(order.order_number as string) || id.slice(0, 8)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
                      meta.color,
                    )}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                </div>
                <p className="text-xs text-brand-smoke mt-0.5">
                  {fmtDateTime(order.created_at as string)}
                </p>
              </div>
              <span className="text-sm font-bold text-brand-accent tabular-nums shrink-0">
                {fmtMoney(Number(order.total_amount ?? 0))}
              </span>
            </div>

            {/* Customer info */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-cloud">
              <span className="font-medium">
                {order.customer_name as string}
              </span>
              {order.customer_phone && (
                <span className="inline-flex items-center gap-1 text-brand-smoke">
                  <Phone className="h-3 w-3" />
                  {order.customer_phone as string}
                </span>
              )}
              {order.customer_email && (
                <span className="inline-flex items-center gap-1 text-brand-smoke">
                  <Mail className="h-3 w-3" />
                  {order.customer_email as string}
                </span>
              )}
            </div>

            {/* Fulfilment + payment */}
            <div className="flex flex-wrap gap-2 text-[10px]">
              <Badge tone="neutral">
                {(order.fulfilment_type as string) === "pickup"
                  ? "Pickup"
                  : "Delivery"}
              </Badge>
              <Badge tone="neutral">
                {(order.payment_method as string) === "bank_transfer"
                  ? "Bank transfer"
                  : "Paystack"}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {status === "proof_submitted" && (
                <>
                  {proofUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<Image className="h-3.5 w-3.5" />}
                      onClick={() => setProofModal(proofUrl)}
                    >
                      View proof
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    leftIcon={<CheckCircle className="h-3.5 w-3.5" />}
                    loading={confirmMutation.isPending}
                    onClick={() => confirmMutation.mutate(id)}
                  >
                    Confirm order
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    leftIcon={<XCircle className="h-3.5 w-3.5" />}
                    onClick={() => setCancelModal(id)}
                  >
                    Cancel
                  </Button>
                </>
              )}
              {status === "pending" && (
                <Button
                  size="sm"
                  variant="danger"
                  leftIcon={<XCircle className="h-3.5 w-3.5" />}
                  onClick={() => setCancelModal(id)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* Proof image modal */}
      <Modal
        open={!!proofModal}
        onClose={() => setProofModal(null)}
        title="Proof of payment"
        size="lg"
      >
        {proofModal && (
          <img
            src={proofModal}
            alt="Proof of payment"
            className="w-full rounded-xl"
          />
        )}
      </Modal>

      {/* Cancel modal */}
      <Modal
        open={!!cancelModal}
        onClose={() => {
          setCancelModal(null);
          setCancelReason("");
        }}
        title="Cancel order"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCancelModal(null);
                setCancelReason("");
              }}
            >
              Back
            </Button>
            <Button
              variant="danger"
              loading={cancelMutation.isPending}
              disabled={!cancelReason.trim()}
              onClick={() =>
                cancelModal &&
                cancelMutation.mutate({
                  orderId: cancelModal,
                  reason: cancelReason,
                })
              }
            >
              Cancel order
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-brand-cloud">
            Why are you cancelling this order? The customer will be notified.
          </p>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Payment not received, customer requested cancellation…"
          />
        </div>
      </Modal>
    </div>
  );
}
