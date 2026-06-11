import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronRight, Users, Package, Banknote } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { Tabs } from "@components/ui/Tabs";
import {
  PartnerBadge,
  PartnerFormModal,
} from "@components/retail-partners/RetailPartnerComponents";
import { getAllPartnersOverview } from "@services/retailPartners";
import { CYCLE_LABEL } from "@lib/constants/retailPartnersConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney } from "@lib/format";
import { Topbar } from "@/components/shell/Topbar";

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "consignment", label: "Consignment" },
  { key: "wholesale", label: "Wholesale" },
  { key: "both", label: "Both" },
];

export default function RetailPartnersHome() {
  const navigate = useNavigate();
  const { currency } = useActiveBusiness();

  const [filterType, setFilterType] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["retail-partners"],
    queryFn: getAllPartnersOverview,
    refetchInterval: 120_000,
  });

  const filtered =
    filterType === "all"
      ? partners
      : partners.filter((p) => p.arrangement_type === filterType);

  // Overview KPIs
  const totalOutstanding = partners.reduce(
    (s, p) => s + (p.outstanding_balance ?? 0),
    0,
  );
  const totalUnitsHeld = partners.reduce((s, p) => s + (p.units_held ?? 0), 0);
  const activeCount = partners.filter((p) => p.is_active).length;

  return (
    <>
      <Topbar
        title="Retail Partners"
        subtitle="Consignment · Wholesale · Settlements"
      />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Retail Partners"
          subtitle="Manage consignment stock, partner sales, and settlement statements."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Retail Partners" }]}
          actions={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Add Partner
            </Button>
          }
        />

        {/* KPI strip */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              icon={Users}
              label="Active Partners"
              value={String(activeCount)}
            />
            <KpiCard
              icon={Package}
              label="Units on Consignment"
              value={totalUnitsHeld.toLocaleString()}
            />
            <KpiCard
              icon={Banknote}
              label="Outstanding Balance"
              value={fmtMoney(totalOutstanding, currency)}
              highlight
            />
          </div>
        )}

        {/* Tabs */}
        <Tabs
          tabs={FILTER_TABS}
          active={filterType}
          onChange={setFilterType}
          surface="dark"
          variant="underline"
        />

        {/* Partner table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-brand-smoke/30 mb-3" />
            <p className="text-sm text-brand-smoke">No retail partners yet.</p>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => setShowCreate(true)}
            >
              Add your first partner
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal">
                  {[
                    "Code",
                    "Partner",
                    "Type",
                    "Units Held",
                    "Outstanding",
                    "Cycle",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((partner) => (
                  <tr
                    key={partner.partner_id}
                    className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors cursor-pointer"
                    onClick={() =>
                      navigate(`/retail-partners/${partner.partner_id}`)
                    }
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-brand-accent">
                        {partner.partner_code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-cream">
                        {partner.display_name}
                      </p>
                      {partner.company_name && (
                        <p className="text-xs text-brand-smoke">
                          {partner.company_name}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PartnerBadge type={partner.arrangement_type} size="xs" />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-brand-cream">
                      {(partner.units_held ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <span
                        className={
                          (partner.outstanding_balance ?? 0) > 0
                            ? "text-amber-400"
                            : "text-brand-smoke"
                        }
                      >
                        {fmtMoney(partner.outstanding_balance ?? 0, currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-smoke text-xs">
                      {CYCLE_LABEL[partner.settlement_cycle]}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-brand-smoke" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PartnerFormModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSaved={(partner) => {
            setShowCreate(false);
            navigate(`/retail-partners/${partner.partner_id}`);
          }}
        />
      </div>
    </>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-4 w-4 text-brand-smoke" />
        <p className="text-xs uppercase tracking-widest text-brand-smoke">
          {label}
        </p>
      </div>
      <p
        className={`font-display text-2xl font-light tabular-nums ${highlight ? "text-amber-400" : "text-brand-cream"}`}
      >
        {value}
      </p>
    </div>
  );
}
