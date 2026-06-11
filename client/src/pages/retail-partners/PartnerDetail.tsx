import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  CheckCircle,
  FileText,
  Package,
  RefreshCcw,
  Plus,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Tabs } from "@components/ui/Tabs";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import {
  PartnerBadge,
  ConsignmentBadge,
  SettlementBadge,
  PartnerFormModal,
  SendConsignmentModal,
  RecallConsignmentModal,
  ReportSaleModal,
  GenerateSettlementModal,
} from "@components/retail-partners/RetailPartnerComponents";
import {
  getPartner,
  listConsignmentStock,
  listPartnerSales,
  listSettlements,
  markSettlementSent,
  markSettlementPaid,
} from "@services/retailPartners";
import {
  PARTNER_TABS,
  CYCLE_LABEL,
} from "@lib/constants/retailPartnersConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDate, fmtDateTime } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { ConsignmentStock } from "@typedefs/retailPartners";

export default function PartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [activeTab, setActiveTab] = useState("stock");
  const [showEdit, setShowEdit] = useState(false);
  const [showSendCons, setShowSendCons] = useState(false);
  const [showRecall, setShowRecall] = useState(false);
  const [showReportSale, setShowReportSale] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [recallTarget, setRecallTarget] = useState<ConsignmentStock | null>(
    null,
  );

  const { data: partner, isLoading } = useQuery({
    queryKey: ["retail-partner", id],
    queryFn: () => getPartner(id!),
    enabled: !!id,
  });

  const { data: stockData } = useQuery({
    queryKey: ["consignment-stock", id],
    queryFn: () => listConsignmentStock({ partner_id: id! }),
    enabled: !!id,
  });
  const { data: salesData = [] } = useQuery({
    queryKey: ["partner-sales", id],
    queryFn: () => listPartnerSales({ partner_id: id! }),
    enabled: !!id,
  });
  const { data: settlementsData = [] } = useQuery({
    queryKey: ["partner-settlements", id],
    queryFn: () => listSettlements({ partner_id: id! }),
    enabled: !!id,
  });

  const consignments = stockData?.data ?? [];

  const sentMutation = useMutation({
    mutationFn: markSettlementSent,
    onSuccess: () => {
      showToast.success("Settlement marked sent");
      qc.invalidateQueries({ queryKey: ["partner-settlements", id] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const paidMutation = useMutation({
    mutationFn: markSettlementPaid,
    onSuccess: () => {
      showToast.success("Settlement marked paid");
      qc.invalidateQueries({ queryKey: ["partner-settlements", id] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-brand-smoke">Partner not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/retail-partners")}
        >
          Back
        </Button>
      </div>
    );
  }

  const isConsignment =
    partner.arrangement_type === "consignment" ||
    partner.arrangement_type === "both";
  const isWholesale =
    partner.arrangement_type === "wholesale" ||
    partner.arrangement_type === "both";

  const visibleTabs = PARTNER_TABS.filter((t) => {
    if (t.key === "wholesale" && !isWholesale) return false;
    if ((t.key === "stock" || t.key === "sales") && !isConsignment)
      return false;
    return true;
  });

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={partner.display_name}
        subtitle={`${partner.partner_code} · ${partner.email ?? partner.primary_phone ?? ""}`}
        crumbs={[
          { label: "Retail Partners", to: "/retail-partners" },
          { label: partner.partner_code },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PartnerBadge type={partner.arrangement_type} />
            {!partner.is_active && <Badge tone="danger">Inactive</Badge>}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowEdit(true)}
            >
              Edit
            </Button>
            {isConsignment && (
              <Button size="sm" onClick={() => setShowSendCons(true)}>
                <Package className="h-4 w-4" />
                Send Stock
              </Button>
            )}
          </div>
        }
      />

      {/* Partner info + balance cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          label="Arrangement"
          value={partner.arrangement_type}
          capitalize
        />
        <InfoCard
          label="Settlement"
          value={CYCLE_LABEL[partner.settlement_cycle]}
        />
        <InfoCard
          label="Payment Terms"
          value={`${partner.payment_terms_days} days`}
        />
        {isConsignment && (
          <InfoCard
            label="Margin"
            value={`${partner.consignment_margin_pct}%`}
          />
        )}
        {isWholesale && (
          <InfoCard
            label="Wholesale Discount"
            value={`${partner.wholesale_discount_pct}%`}
          />
        )}
        <InfoCard
          label="Credit Limit"
          value={fmtMoney(partner.credit_limit, currency)}
        />
        <InfoCard
          label="Current Balance"
          value={fmtMoney(partner.current_balance, currency)}
          highlight={partner.current_balance > 0}
        />
        {partner.dashboard && (
          <InfoCard
            label="Units Held"
            value={String(partner.dashboard.units_held)}
          />
        )}
        {partner.balance && (
          <InfoCard
            label="Outstanding"
            value={fmtMoney(partner.balance.outstanding_balance, currency)}
            highlight={partner.balance.outstanding_balance > 0}
          />
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        {isConsignment && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowReportSale(true)}
            >
              <Plus className="h-4 w-4" />
              Report Sale
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSettlement(true)}
            >
              <FileText className="h-4 w-4" />
              Generate Settlement
            </Button>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        tabs={visibleTabs.map((t) => ({ key: t.key, label: t.label }))}
        active={activeTab}
        onChange={setActiveTab}
        surface="dark"
        variant="underline"
      />

      {/* Stock tab */}
      {activeTab === "stock" && (
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-brand-charcoal">
                {[
                  "Product",
                  "Sent",
                  "Sold",
                  "Outstanding",
                  "Agreed Price",
                  "Date",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {consignments.map((c) => (
                <tr key={c.consignment_id} className="bg-brand-charcoal">
                  <td className="px-3 py-3 text-brand-cream">
                    {c.product_name ?? c.product_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-brand-smoke">
                    {c.quantity_sent}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-brand-smoke">
                    {c.quantity_sold}
                  </td>
                  <td className="px-3 py-3 tabular-nums font-medium text-brand-cream">
                    {c.quantity_outstanding}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-brand-smoke">
                    {fmtMoney(c.agreed_price, currency)}
                  </td>
                  <td className="px-3 py-3 text-brand-smoke">
                    {fmtDate(c.sent_date)}
                  </td>
                  <td className="px-3 py-3">
                    <ConsignmentBadge status={c.status} />
                  </td>
                  <td className="px-3 py-3">
                    {c.status === "active" && c.quantity_outstanding > 0 && (
                      <button
                        title="Recall"
                        onClick={() => {
                          setRecallTarget(c);
                          setShowRecall(true);
                        }}
                        className="text-brand-smoke hover:text-brand-accent transition-colors"
                      >
                        <RefreshCcw className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {consignments.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-sm text-brand-smoke"
                  >
                    No consignment stock on file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sales tab */}
      {activeTab === "sales" && (
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-brand-charcoal">
                {[
                  "Sale Date",
                  "Qty Sold",
                  "Sale Price",
                  "Total",
                  "Notes",
                  "Recorded",
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
              {salesData.map((s: any) => (
                <tr key={s.sale_id} className="bg-brand-charcoal">
                  <td className="px-4 py-3 text-brand-smoke">
                    {fmtDate(s.sale_date)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-brand-cream">
                    {s.quantity_sold}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-brand-smoke">
                    {fmtMoney(s.sale_price, currency)}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium text-brand-cream">
                    {fmtMoney(s.sale_price * s.quantity_sold, currency)}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke">
                    {s.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke">
                    {fmtDateTime(s.recorded_at)}
                  </td>
                </tr>
              ))}
              {salesData.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-brand-smoke"
                  >
                    No sales reported yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Settlements tab */}
      {activeTab === "settlements" && (
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-brand-charcoal">
                {[
                  "Number",
                  "Period",
                  "Sales Value",
                  "Commission",
                  "Amount Due",
                  "Status",
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
              {settlementsData.map((s: any) => (
                <tr key={s.settlement_id} className="bg-brand-charcoal">
                  <td className="px-4 py-3 font-mono text-xs text-brand-accent">
                    {s.settlement_number}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke">
                    {fmtDate(s.period_start)} – {fmtDate(s.period_end)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-brand-cream">
                    {fmtMoney(s.total_sales_value, currency)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-brand-smoke">
                    {fmtMoney(s.partner_commission, currency)}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium text-brand-cream">
                    {fmtMoney(s.amount_due_to_us, currency)}
                  </td>
                  <td className="px-4 py-3">
                    <SettlementBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {s.status === "draft" && (
                        <button
                          onClick={() => sentMutation.mutate(s.settlement_id)}
                          className="text-brand-smoke hover:text-brand-accent transition-colors"
                          title="Mark Sent"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {s.status === "sent" && (
                        <button
                          onClick={() => paidMutation.mutate(s.settlement_id)}
                          className="text-brand-smoke hover:text-green-400 transition-colors"
                          title="Mark Paid"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {settlementsData.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-brand-smoke"
                  >
                    No settlements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showEdit && (
        <PartnerFormModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            qc.invalidateQueries({ queryKey: ["retail-partner", id] });
          }}
          existing={partner}
        />
      )}
      {showSendCons && (
        <SendConsignmentModal
          open={showSendCons}
          onClose={() => setShowSendCons(false)}
          partner={partner}
          currency={currency}
        />
      )}
      {showRecall && recallTarget && (
        <RecallConsignmentModal
          open={showRecall}
          onClose={() => {
            setShowRecall(false);
            setRecallTarget(null);
          }}
          partnerId={id!}
          consignment={recallTarget}
          currency={currency}
        />
      )}
      {showReportSale && (
        <ReportSaleModal
          open={showReportSale}
          onClose={() => setShowReportSale(false)}
          partner={partner}
          currency={currency}
        />
      )}
      {showSettlement && (
        <GenerateSettlementModal
          open={showSettlement}
          onClose={() => setShowSettlement(false)}
          partner={partner}
          currency={currency}
          onGenerated={() => {
            setShowSettlement(false);
            setActiveTab("settlements");
          }}
        />
      )}
    </div>
  );
}

function InfoCard({
  label,
  value,
  capitalize = false,
  highlight = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-brand-charcoal px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
        {label}
      </p>
      <p
        className={`text-sm font-semibold tabular-nums ${capitalize ? "capitalize" : ""} ${highlight ? "text-amber-400" : "text-brand-cream"}`}
      >
        {value}
      </p>
    </div>
  );
}
