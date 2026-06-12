import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  FileQuestion,
  Sparkles,
  Send,
  Trophy,
  ArrowUpRight,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Skeleton } from "@components/ui/Skeleton";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { EmptyState } from "@components/ui/EmptyState";
import {
  listRFQs,
  listQuotesForRFQ,
  generatePOFromQuote,
  sendRFQ,
} from "@services/purchasing/rfqs";
import { listSuppliers } from "@services/purchasing/suppliers";
import { fmtDate, fmtRelative, fmtMoney } from "@lib/format";
import { scoreQuotes } from "@lib/quoteScoring";
import type { Supplier } from "@typedefs/purchasing";
import { showToast } from "@hooks/useToast";

export default function RFQDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showTokens, setShowTokens] = useState(false);
  const [generatingPO, setGeneratingPO] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Backend doesn't have GET /rfqs/:id — we look up via list + filter.
  const { data: rfqList, isLoading, refetch } = useQuery({
    queryKey: ["purchasing", "rfqs", "all"],
    queryFn: () => listRFQs({ limit: 200 }),
  });
  const rfq = rfqList?.data.find((r) => r.rfq_id === id);

  const { data: quotes = [] } = useQuery({
    queryKey: ["purchasing", "rfq-quotes", id],
    queryFn: () => listQuotesForRFQ(id!),
    enabled: !!id,
  });
  const { data: suppliersResp } = useQuery({
    queryKey: ["purchasing", "suppliers"],
    queryFn: () => listSuppliers({ limit: 200 }),
  });

  const suppliersById: Record<string, Supplier> = useMemo(() => {
    const m: Record<string, Supplier> = {};
    for (const s of suppliersResp?.data ?? []) m[s.supplier_id] = s;
    return m;
  }, [suppliersResp]);

  const scored = useMemo(
    () => scoreQuotes(quotes, suppliersById),
    [quotes, suppliersById],
  );

  return (
    <>
      <Topbar title={rfq?.title || "RFQ"} subtitle={rfq?.rfq_number} />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Procurement", to: "/procurement" },
              { label: "RFQs", to: "/procurement/rfqs" },
              { label: rfq?.title ?? "…" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate("/procurement/rfqs")}
          >
            Back
          </Button>
        </div>

        {isLoading || !rfq ? (
          <div className="space-y-3">
            <Skeleton className="h-44" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <Card className="p-5 sm:p-6 mb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[0.6rem] text-brand-smoke font-mono">
                    {rfq.rfq_number}
                  </div>
                  <h1 className="font-display text-3xl text-brand-cream mt-1">
                    {rfq.title}
                  </h1>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <Badge
                      tone={
                        rfq.status === "sent"
                          ? "gold"
                          : rfq.status === "responses_received"
                            ? "sage"
                            : "neutral"
                      }
                      size="sm"
                      dot
                    >
                      {rfq.status.replace("_", " ")}
                    </Badge>
                    {rfq.response_deadline && (
                      <Badge tone="rose" size="sm">
                        Deadline {fmtDate(rfq.response_deadline)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {rfq.status === "draft" && (
                    <Button
                      variant="gold"
                      leftIcon={<Send className="w-4 h-4" />}
                      loading={sending}
                      onClick={async () => {
                        setSending(true);
                        try {
                          await sendRFQ(rfq.rfq_id);
                          showToast.success(
                            "RFQ sent",
                            "Suppliers can now submit quotes via their portal links.",
                          );
                          await refetch();
                        } catch (e: unknown) {
                          showToast.error(
                            "Failed to send RFQ",
                            (e as { message?: string })?.message ??
                              "Unknown error",
                          );
                        } finally {
                          setSending(false);
                        }
                      }}
                    >
                      Send to suppliers
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => setShowTokens((v) => !v)}
                  >
                    {showTokens ? "Hide" : "Show"} portal links
                  </Button>
                </div>
              </div>
              {rfq.notes && (
                <p className="mt-4 text-sm text-brand-cloud">{rfq.notes}</p>
              )}
            </Card>

            {/* Portal token info */}
            {showTokens && (
              <Card className="p-4 mb-6 bg-brand-accent/[0.04] border-brand-accent/30">
                <div className="flex items-start gap-2 text-sm">
                  <Sparkles className="w-4 h-4 text-brand-accent mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-brand-cream">
                      Sending this RFQ generates a unique tokenised URL per
                      supplier:
                    </p>
                    <code className="block mt-2 px-3 py-2 bg-brand-black/40 rounded-lg font-mono text-xs text-brand-accent">
                      https://app.orikaliving.com/rfq/&lt;token&gt;
                    </code>
                    <p className="text-xs text-brand-smoke mt-2">
                      Each supplier can only see their own submission form.
                      Click <strong>Send RFQ</strong> to dispatch the tokens.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Quotes (with best-value scoring) */}
            <section>
              <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3 inline-flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5" /> Supplier responses ·{" "}
                {scored.length}
              </h3>
              {scored.length === 0 ? (
                <EmptyState
                  icon={<FileQuestion className="w-6 h-6" />}
                  title="Waiting for responses"
                  description="Suppliers will submit their quotes via the portal URLs. The system will rank them by best value as they come in."
                />
              ) : (
                <div className="space-y-2">
                  {scored.map((q) => {
                    const sup = suppliersById[q.supplier_id];
                    return (
                      <Card
                        key={q.quote_id}
                        className={`p-4 ${q.is_recommended ? "border-brand-accent/40 bg-brand-accent/[0.04]" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            {q.is_recommended && (
                              <Trophy className="w-4 h-4 text-brand-accent shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  to={`/procurement/suppliers/${q.supplier_id}`}
                                  className="text-sm font-medium text-brand-cream hover:text-brand-accent truncate"
                                >
                                  {sup?.display_name ?? q.supplier_name}
                                </Link>
                                {q.is_recommended && (
                                  <Badge tone="gold" size="xs">
                                    Best value
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[0.65rem] text-brand-smoke mt-0.5">
                                Score{" "}
                                {((q.weighted_score ?? 0) * 100).toFixed(0)}/100
                                · {fmtRelative(q.created_at)}
                                {q.lead_time_days &&
                                  ` · ${q.lead_time_days}d lead`}
                                {q.valid_until &&
                                  ` · valid until ${fmtDate(q.valid_until)}`}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-lg text-brand-accent">
                              {fmtMoney(q.unit_price, q.currency)}
                            </span>
                            <Button
                              variant="gold"
                              size="sm"
                              leftIcon={
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              }
                              loading={generatingPO === q.quote_id}
                              onClick={async () => {
                                setGeneratingPO(q.quote_id);
                                try {
                                  const po = await generatePOFromQuote(
                                    q.quote_id,
                                  );
                                  showToast.success(
                                    "PO created",
                                    `${po.po_number} is ready.`,
                                  );
                                  navigate(
                                    `/procurement/purchase-orders/${po.po_id}`,
                                  );
                                } catch (e: unknown) {
                                  showToast.error(
                                    "Failed to generate PO",
                                    (e as { message?: string })?.message ??
                                      "Unknown error",
                                  );
                                } finally {
                                  setGeneratingPO(null);
                                }
                              }}
                            >
                              Generate PO
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
