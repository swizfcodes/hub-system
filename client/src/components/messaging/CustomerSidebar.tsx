import { useQuery } from "@tanstack/react-query";
import {
  Phone,
  Mail,
  Package,
  FileText,
  Truck,
  ExternalLink,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import { getCustomer360 } from "@services/messaging";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDate } from "@lib/format";
import type { Channel } from "@typedefs/messaging";

interface CustomerSidebarProps {
  channel: Channel;
}

export function CustomerSidebar({ channel }: CustomerSidebarProps) {
  const navigate = useNavigate();
  const { currency } = useActiveBusiness();

  // Find the contact_id from channel members (the non-user member = the customer)
  const customerMember = channel.members?.find(
    (m) => m.contact_id && !m.user_id,
  );
  const contactId = customerMember?.contact_id;

  const { data, isLoading } = useQuery({
    queryKey: ["customer360", contactId],
    queryFn: () => getCustomer360(contactId!),
    enabled: !!contactId,
    staleTime: 5 * 60_000,
  });

  if (!contactId) {
    return (
      <div className="flex h-full items-center justify-center border-l border-white/5 bg-brand-black p-6">
        <div className="text-center">
          <User className="mx-auto h-8 w-8 text-brand-smoke/30 mb-2" />
          <p className="text-xs text-brand-smoke">Internal channel</p>
          <p className="text-[10px] text-brand-smoke/50 mt-1">
            No customer profile
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border-l border-white/5 bg-brand-black p-4 space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  const contact = data?.contact;
  const orders = data?.orders ?? [];
  const invoices = data?.invoices ?? [];
  const deliveries = data?.deliveries ?? [];

  return (
    <div className="flex h-full flex-col border-l border-white/5 bg-brand-black overflow-y-auto">
      {/* Contact profile */}
      <div className="border-b border-white/5 p-4 space-y-3">
        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-charcoal flex items-center justify-center shrink-0">
            <span className="text-sm font-semibold text-brand-cream">
              {contact?.display_name?.charAt(0).toUpperCase() ?? "?"}
            </span>
          </div>
          <div>
            <p className="font-semibold text-brand-cream text-sm">
              {contact?.display_name ?? "Customer"}
            </p>
            {contact?.company_name && (
              <p className="text-xs text-brand-smoke">{contact.company_name}</p>
            )}
          </div>
          <button
            onClick={() =>
              contact?.contact_id && navigate(`/contacts/${contact.contact_id}`)
            }
            className="ml-auto text-brand-smoke hover:text-brand-accent transition-colors"
            title="Open full contact profile"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>

        {/* Contact details */}
        <div className="space-y-1.5">
          {contact?.primary_phone && (
            <div className="flex items-center gap-2 text-xs text-brand-cloud">
              <Phone className="h-3.5 w-3.5 text-brand-smoke shrink-0" />
              {contact.primary_phone}
            </div>
          )}
          {contact?.email && (
            <div className="flex items-center gap-2 text-xs text-brand-cloud">
              <Mail className="h-3.5 w-3.5 text-brand-smoke shrink-0" />
              <span className="truncate">{contact.email}</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <Section
        title="Recent Orders"
        icon={<Package className="h-3.5 w-3.5" />}
        count={orders.length}
        onViewAll={() => navigate(`/sales/orders?contact_id=${contactId}`)}
      >
        {orders.length === 0 ? (
          <EmptyRow>No orders</EmptyRow>
        ) : (
          orders.slice(0, 4).map((order: any) => (
            <button
              key={order.order_id}
              onClick={() => navigate(`/sales/orders/${order.order_id}`)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-brand-charcoal/50 transition-colors text-left"
            >
              <div>
                <p className="text-xs font-medium text-brand-cream">
                  {order.order_number}
                </p>
                <p className="text-[10px] text-brand-smoke">
                  {fmtDate(order.created_at)}
                </p>
              </div>
              <StatusChip status={order.status} />
            </button>
          ))
        )}
      </Section>

      {/* Open Invoices */}
      <Section
        title="Open Invoices"
        icon={<FileText className="h-3.5 w-3.5" />}
        count={invoices.length}
        onViewAll={() => navigate(`/invoices?contact_id=${contactId}`)}
      >
        {invoices.length === 0 ? (
          <EmptyRow>No outstanding invoices</EmptyRow>
        ) : (
          invoices.slice(0, 4).map((inv: any) => (
            <button
              key={inv.invoice_id}
              onClick={() => navigate(`/invoices/${inv.invoice_id}`)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-brand-charcoal/50 transition-colors text-left"
            >
              <div>
                <p className="text-xs font-medium text-brand-cream">
                  {inv.invoice_number}
                </p>
                <p className="text-[10px] text-brand-smoke">
                  Due {fmtDate(inv.due_date)}
                </p>
              </div>
              <p className="text-xs font-semibold text-amber-400 tabular-nums shrink-0">
                {fmtMoney(inv.amount_due, currency)}
              </p>
            </button>
          ))
        )}
      </Section>

      {/* Deliveries */}
      <Section
        title="Deliveries"
        icon={<Truck className="h-3.5 w-3.5" />}
        count={deliveries.length}
        onViewAll={() => navigate(`/logistics?contact_id=${contactId}`)}
      >
        {deliveries.length === 0 ? (
          <EmptyRow>No deliveries</EmptyRow>
        ) : (
          deliveries.slice(0, 4).map((del: any) => (
            <button
              key={del.delivery_id}
              onClick={() => navigate(`/logistics/${del.delivery_id}`)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-brand-charcoal/50 transition-colors text-left"
            >
              <p className="text-xs font-medium text-brand-cream">
                {del.delivery_number}
              </p>
              <StatusChip status={del.status} />
            </button>
          ))
        )}
      </Section>
    </div>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  count,
  children,
  onViewAll,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  onViewAll: () => void;
}) {
  return (
    <div className="border-b border-white/5">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke">
          {icon}
          {title}
          {count > 0 && (
            <span className="rounded-full bg-brand-graphite px-1.5 text-brand-smoke/70">
              {count}
            </span>
          )}
        </div>
        {count > 0 && (
          <button
            onClick={onViewAll}
            className="text-[10px] text-brand-accent hover:underline"
          >
            View all
          </button>
        )}
      </div>
      <div className="pb-2">{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-3 text-xs text-brand-smoke/50">{children}</p>;
}

const STATUS_TONES: Record<
  string,
  "sage" | "warn" | "info" | "danger" | "neutral" | "gold"
> = {
  paid: "sage",
  delivered: "sage",
  confirmed: "sage",
  active: "sage",
  pending: "warn",
  pending_dispatch: "warn",
  awaiting_dispatch: "warn",
  draft: "neutral",
  cancelled: "neutral",
  returned: "neutral",
  dispatched: "info",
  in_transit: "info",
  failed: "danger",
  rejected: "danger",
  approved: "gold",
};

function StatusChip({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? "neutral";
  return (
    <Badge tone={tone} size="xs">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
