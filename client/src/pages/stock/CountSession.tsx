import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  MapPin,
  Search,
  Check,
  AlertTriangle,
  Save,
  Camera,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { ConfirmationModal } from "@components/ui/ConfirmationModal";
import { ProductImage } from "@components/catalogue/shared/ProductImage";
import { listLocations } from "@services/catalogue/locations";
import { listOnHand } from "@services/stock/onHand";
import { createBatchAdjustments } from "@services/stock/adjustments";
import { lookupBarcode } from "@services/catalogue/products";
import { useAuthStore } from "@stores/useAuthStore";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { AdjustmentValues } from "@lib/schemas/stock";
import type { OnHandRow } from "@typedefs/stock";

type Stage = "setup" | "count" | "review";

interface CountRow {
  product_id: string;
  product_sku: string;
  product_name: string;
  primary_image_url?: string | null;
  system_count: number;
  counted: number | null;
  notes?: string;
}

export default function CountSession() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [stage, setStage] = useState<Stage>("setup");
  const [locationId, setLocationId] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [rows, setRows] = useState<CountRow[]>([]);
  const [search, setSearch] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);

  // ── Stage 1: setup ──
  const { data: locations = [] } = useQuery({
    queryKey: ["catalogue", "locations"],
    queryFn: () => listLocations(false),
  });
  const counted = useMemo(
    () => rows.filter((r) => r.counted !== null).length,
    [rows],
  );
  const variances = useMemo(
    () =>
      rows.filter((r) => r.counted !== null && r.counted !== r.system_count),
    [rows],
  );

  // Load products with on-hand for the chosen location
  const startCount = async () => {
    if (!locationId) {
      showToast.error("Pick a location");
      return;
    }
    try {
      const resp = await listOnHand({ location_id: locationId, limit: 500 });
      const list: CountRow[] = resp.data.map((p: OnHandRow) => {
        const here = (p.by_location ?? []).find(
          (b) => b.location_id === locationId,
        );
        return {
          product_id: p.product_id,
          product_sku: p.product_sku,
          product_name: p.product_name,
          primary_image_url: p.primary_image_url,
          system_count: here?.on_hand ?? 0,
          counted: null,
        };
      });
      setRows(list);
      setStage("count");
      setTimeout(() => searchRef.current?.focus(), 100);
    } catch (e) {
      showToast.error("Could not load products", errMsg(e));
    }
  };

  // ── Stage 2: count UX ──
  const setCount = (productId: string, count: number | null) => {
    setRows((prev) =>
      prev.map((r) =>
        r.product_id === productId ? { ...r, counted: count } : r,
      ),
    );
  };
  const setNote = (productId: string, notes: string) => {
    setRows((prev) =>
      prev.map((r) => (r.product_id === productId ? { ...r, notes } : r)),
    );
  };

  // Barcode scan support (stub — wires in @zxing/library when camera permission granted)
  const onScanResult = async (barcodeValue: string) => {
    try {
      const product = await lookupBarcode(barcodeValue);
      if (!product) {
        showToast.error("Barcode not found");
        return;
      }
      const exists = rows.find((r) => r.product_id === product.product_id);
      if (!exists) {
        showToast.warn(
          "Not at this location",
          `${product.name} isn't expected here.`,
        );
        return;
      }
      // Increment counted by 1
      const current = exists.counted ?? 0;
      setCount(product.product_id, current + 1);
      showToast.success(`+1 ${product.name}`, `Now counted: ${current + 1}`);
    } catch (e) {
      showToast.error("Lookup failed", errMsg(e));
    }
  };

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        r.product_sku.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // ── Stage 3: submit ──
  const submitMutation = useMutation({
    mutationFn: async () => {
      const adjustments: AdjustmentValues[] = variances.map((r) => ({
        product_id: r.product_id,
        location_id: locationId,
        adjustment_type: "count" as const,
        quantity_before: r.system_count,
        quantity_after: r.counted ?? r.system_count,
        reason: r.notes
          ? `Count session: ${r.notes}`
          : `Count session at ${locations.find((l) => l.location_id === locationId)?.name ?? "location"}${sessionNotes ? ` — ${sessionNotes}` : ""}`,
      }));
      return createBatchAdjustments(adjustments);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      showToast.success(
        "Count submitted",
        `${res.created} adjustment${res.created === 1 ? "" : "s"} recorded.`,
      );
      navigate("/stock");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <>
      <Topbar title="Count session" subtitle="Physical reconciliation" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Stock", to: "/stock" },
              { label: "Count session" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() =>
              stage === "count" ? setStage("setup") : navigate("/stock")
            }
          >
            {stage === "count" ? "Back to setup" : "Cancel"}
          </Button>
        </div>

        {/* Stage indicator */}
        <div className="mb-6 flex items-center gap-2 text-[0.65rem] uppercase tracking-widest">
          <StageStep
            label="Setup"
            active={stage === "setup"}
            done={stage !== "setup"}
          />
          <span className="text-brand-graphite">─</span>
          <StageStep
            label="Count"
            active={stage === "count"}
            done={stage === "review"}
          />
          <span className="text-brand-graphite">─</span>
          <StageStep label="Review" active={stage === "review"} done={false} />
        </div>

        {/* ── STAGE 1: SETUP ── */}
        {stage === "setup" && (
          <Card className="p-6 sm:p-8">
            <h2 className="font-display text-2xl text-brand-cream mb-2">
              Start a count
            </h2>
            <p className="text-sm text-brand-cloud mb-6">
              Pick the location you'll walk. The system loads every product
              expected there. You count, system records the variances as a
              single batch of adjustments.
            </p>

            <div className="space-y-5 max-w-md">
              <Select
                label="Location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                placeholder="Pick a location to count"
                options={locations.map((l) => ({
                  value: l.location_id,
                  label: `${l.name} · ${l.location_type.replace("_", " ")}`,
                }))}
              />
              <Textarea
                label="Session notes (optional)"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                rows={3}
                placeholder="What's the context? Quarterly count, post-event reconciliation, etc."
              />
              <div className="rounded-xl bg-brand-charcoal/40 border border-brand-graphite p-3 text-[0.7rem] text-brand-cloud">
                <strong className="text-brand-cream block mb-1">Tips</strong>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>
                    Use a phone — the layout reformats and the camera button
                    enables barcode scanning
                  </li>
                  <li>
                    Tap a row, type the count, press Enter to move to the next
                  </li>
                  <li>
                    Variances are highlighted as you go; you can submit only the
                    ones that differ
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                variant="gold"
                leftIcon={<MapPin className="w-4 h-4" />}
                disabled={!locationId}
                onClick={startCount}
              >
                Begin count
              </Button>
            </div>
          </Card>
        )}

        {/* ── STAGE 2: COUNT ── */}
        {stage === "count" && (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end sticky top-16 z-20 bg-brand-black/70 backdrop-blur-md py-2 -mx-4 sm:-mx-8 px-4 sm:px-8 border-b border-brand-graphite">
              <Input
                ref={searchRef as React.Ref<HTMLInputElement>}
                surface="dark"
                placeholder="Filter by name or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
              <Button
                variant="secondary"
                leftIcon={<Camera className="w-4 h-4" />}
                onClick={() =>
                  onScanResult(
                    prompt("Barcode (paste from scanner or camera):") || "",
                  )
                }
              >
                Scan
              </Button>
              <Button
                variant="gold"
                leftIcon={<Save className="w-4 h-4" />}
                disabled={counted === 0}
                onClick={() => setStage("review")}
              >
                Review {counted}/{rows.length}
              </Button>
            </div>

            <div className="space-y-2">
              {filteredRows.map((r) => {
                const counted = r.counted !== null;
                const variance = counted ? r.counted! - r.system_count : 0;
                return (
                  <Card
                    key={r.product_id}
                    className={cn(
                      "p-3",
                      counted &&
                        variance === 0 &&
                        "border-accent2/40 bg-accent2/[0.04]",
                      counted &&
                        variance !== 0 &&
                        "border-state-warn/40 bg-state-warn/[0.05]",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <ProductImage
                        product={{
                          name: r.product_name,
                          primary_image_url: r.primary_image_url,
                        }}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-brand-cream truncate">
                          {r.product_name}
                        </div>
                        <div className="text-[0.6rem] font-mono text-brand-smoke">
                          {r.product_sku}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
                          System
                        </div>
                        <div className="font-mono text-brand-cream">
                          {r.system_count}
                        </div>
                      </div>
                      <NumberField
                        surface="dark"
                        value={r.counted ?? undefined}
                        onValueChange={(v) => setCount(r.product_id, v ?? null)}
                        placeholder="Count"
                        className="w-24"
                      />
                      <div
                        className={cn(
                          "w-16 text-center font-mono text-sm rounded-lg py-2",
                          !counted && "text-brand-smoke",
                          counted && variance === 0 && "text-accent2",
                          counted && variance > 0 && "text-accent2",
                          counted && variance < 0 && "text-state-danger",
                        )}
                      >
                        {!counted ? "—" : (variance > 0 ? "+" : "") + variance}
                      </div>
                    </div>
                  </Card>
                );
              })}
              {filteredRows.length === 0 && (
                <EmptyState
                  icon={<Search className="w-6 h-6" />}
                  title="No matches"
                  description="Clear the filter to see all products at this location."
                />
              )}
            </div>
          </>
        )}

        {/* ── STAGE 3: REVIEW ── */}
        {stage === "review" && (
          <>
            <Card className="p-5 mb-5">
              <div className="grid grid-cols-3 gap-4">
                <Stat
                  label="Products counted"
                  value={`${counted} / ${rows.length}`}
                />
                <Stat
                  label="Variances"
                  value={String(variances.length)}
                  tone={variances.length > 0 ? "warn" : "sage"}
                />
                <Stat
                  label="Net difference"
                  value={`${variances.reduce((s, r) => s + (r.counted! - r.system_count), 0)}`}
                />
              </div>
            </Card>

            {variances.length === 0 ? (
              <EmptyState
                icon={<Check className="w-6 h-6" />}
                title="Perfect count — no variances"
                description="Every counted item matches the system. Nothing to adjust. The session itself is logged for audit."
                action={
                  <Button variant="gold" onClick={() => navigate("/stock")}>
                    Done
                  </Button>
                }
              />
            ) : (
              <>
                <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3">
                  Variances to submit · {variances.length}
                </h3>
                <div className="space-y-2 mb-6">
                  {variances.map((r) => {
                    const variance = r.counted! - r.system_count;
                    return (
                      <Card
                        key={r.product_id}
                        className="p-3 flex items-center gap-3"
                      >
                        <ProductImage
                          product={{
                            name: r.product_name,
                            primary_image_url: r.primary_image_url,
                          }}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-brand-cream truncate">
                            {r.product_name}
                          </div>
                          <div className="text-[0.6rem] font-mono text-brand-smoke">
                            {r.product_sku}
                          </div>
                        </div>
                        <div className="text-xs text-brand-smoke">
                          {r.system_count} →{" "}
                          <span className="text-brand-cream font-mono">
                            {r.counted}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "font-mono text-sm",
                            variance > 0
                              ? "text-accent2"
                              : "text-state-danger",
                          )}
                        >
                          {variance > 0 ? "+" : ""}
                          {variance}
                        </div>
                        <Input
                          surface="dark"
                          placeholder="Reason note"
                          value={r.notes ?? ""}
                          onChange={(e) =>
                            setNote(r.product_id, e.target.value)
                          }
                          className="w-40"
                        />
                      </Card>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline-light"
                    onClick={() => setStage("count")}
                  >
                    Back to counting
                  </Button>
                  <Button
                    variant="gold"
                    leftIcon={<AlertTriangle className="w-4 h-4" />}
                    onClick={() => setConfirmSubmit(true)}
                  >
                    Submit {variances.length} variance
                    {variances.length === 1 ? "" : "s"}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={async () => {
          await submitMutation.mutateAsync();
          setConfirmSubmit(false);
        }}
        title="Submit count session?"
        message={
          <div className="space-y-2">
            <p>
              This will create{" "}
              <strong>
                {variances.length} adjustment{variances.length === 1 ? "" : "s"}
              </strong>{" "}
              in the audit log under your name (
              {user?.display_name ?? user?.email}).
            </p>
            <p className="text-text-on-light-muted">
              Net effect:{" "}
              {variances.reduce((s, r) => s + (r.counted! - r.system_count), 0)}{" "}
              units. Cannot be undone — only counter-adjusted later.
            </p>
          </div>
        }
        confirmLabel="Submit count"
        tone="warn"
        loading={submitMutation.isPending}
      />
    </>
  );
}

function StageStep({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        active
          ? "text-brand-accent"
          : done
            ? "text-accent2"
            : "text-brand-smoke",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          active
            ? "bg-brand-accent"
            : done
              ? "bg-accent2"
              : "bg-brand-graphite",
        )}
      />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "sage";
}) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
        {label}
      </div>
      <div
        className={cn(
          "text-2xl font-display mt-1 tabular-nums",
          tone === "warn"
            ? "text-state-warn"
            : tone === "sage"
              ? "text-accent2"
              : "text-brand-cream",
        )}
      >
        {value}
      </div>
    </div>
  );
}
