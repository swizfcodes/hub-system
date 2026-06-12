// The searchable, segmented client list — the daily lookup tool.
// One row per customer: who they are, what they're worth, when they
// last bought, loyalty points and one-tap call/WhatsApp.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, Cake, SlidersHorizontal } from "lucide-react";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { listClients, type ClientListParams } from "@services/crm/clients";
import { fmtMoney, fmtRelative } from "@lib/format";
import { cn } from "@lib/cn";
import {
  ClientAvatar,
  QuickReach,
  SegmentBadge,
  VipStar,
} from "./ClientBits";

const SEGMENT_CHIPS: Array<{ key: string; label: string }> = [
  { key: "", label: "All clients" },
  { key: "vip", label: "VIP" },
  { key: "big_spender", label: "Big spenders" },
  { key: "new", label: "New" },
  { key: "lapsed", label: "Win back" },
  { key: "birthdays", label: "Birthdays soon" },
];

export function ClientsList({
  onOpenSettings,
  canEditSettings,
}: {
  onOpenSettings?: () => void;
  canEditSettings?: boolean;
}) {
  const navigate = useNavigate();
  const { active: business } = useActiveBusiness();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [segment, setSegment] = useState("");
  const [sort, setSort] = useState<ClientListParams["sort"]>("recent");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, segment, sort]);

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "clients", business, debounced, segment, sort, page],
    queryFn: () =>
      listClients({
        search: debounced || undefined,
        segment: (segment || undefined) as ClientListParams["segment"],
        sort,
        page,
        limit: 30,
      }),
    placeholderData: keepPreviousData,
  });

  const total = data?.pagination.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 30));

  return (
    <div>
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-smoke pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a client — name, phone, email…"
            className="pl-10"
            aria-label="Search clients"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as ClientListParams["sort"])
            }
            options={[
              { value: "recent", label: "Recently active" },
              { value: "spend", label: "Highest spend" },
              { value: "name", label: "Name A–Z" },
            ]}
            aria-label="Sort clients"
          />
          {canEditSettings && onOpenSettings && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSettings}
              title="Segment thresholds"
              leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            >
              Tune
            </Button>
          )}
        </div>
      </div>

      {/* Segment chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {SEGMENT_CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => setSegment(c.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-wide border transition-all",
              segment === c.key
                ? "bg-brand-accent text-brand-black border-brand-accent"
                : "bg-transparent text-brand-smoke border-brand-graphite hover:text-brand-cream hover:border-brand-smoke",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (data?.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Search className="w-6 h-6" />}
          title={debounced || segment ? "No clients match" : "No clients yet"}
          description={
            debounced || segment
              ? "Try a different search or segment."
              : "Customers appear here as soon as they're added to the directory or make a purchase."
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {(data?.data ?? []).map((c) => {
              const birthdaySoon =
                c.next_birthday &&
                (new Date(c.next_birthday).getTime() - Date.now()) / 86400000 <=
                  7;
              return (
                <div
                  key={c.contact_id}
                  onClick={() => navigate(`/crm/clients/${c.contact_id}`)}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-brand-graphite bg-brand-charcoal/60 cursor-pointer hover:border-brand-accent/40 transition-colors"
                >
                  <ClientAvatar name={c.display_name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-brand-cream font-medium truncate">
                        {c.display_name}
                      </span>
                      <VipStar isVip={c.is_vip} />
                      <SegmentBadge segment={c.segment} />
                      {birthdaySoon && (
                        <span
                          className="inline-flex items-center gap-1 text-[0.6rem] text-accent3"
                          title={`Birthday ${c.next_birthday}`}
                        >
                          <Cake className="w-3 h-3" /> soon
                        </span>
                      )}
                    </div>
                    <div className="text-[0.65rem] text-brand-smoke mt-0.5 truncate">
                      {c.last_purchase_at
                        ? `Last purchase ${fmtRelative(c.last_purchase_at)}`
                        : "No purchases yet"}
                      {c.loyalty_points > 0 &&
                        ` · ${c.loyalty_points.toLocaleString()} pts`}
                      {c.company_name && ` · ${c.company_name}`}
                    </div>
                  </div>
                  <div className="hidden sm:block text-right mr-1">
                    <div className="text-sm font-mono text-brand-accent tabular-nums">
                      {fmtMoney(Number(c.total_spend), "NGN")}
                    </div>
                    <div className="text-[0.6rem] text-brand-smoke">
                      {c.purchase_count} purchase
                      {c.purchase_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <QuickReach phone={c.primary_phone} whatsapp={c.whatsapp_number} />
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-[0.65rem] text-brand-smoke">
                {total} client{total === 1 ? "" : "s"}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
