import { useBranding } from "@/providers/ThemeProvider";
import { useParams } from "react-router-dom";
import { useState } from "react";
import {
  Send,
  Sparkles,
  AlertCircle,
  Check,
  Building2,
  ArrowDown,
} from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { NumberField } from "@components/ui/NumberField";
import { Textarea } from "@components/ui/Textarea";
import { Select } from "@components/ui/Select";
import { CURRENCIES } from "@lib/constants/currencies";
import { showToast } from "@hooks/useToast";

/**
 * Public-facing supplier portal. NO login required.
 * The route is /rfq/:token — outside the AppShell.
 *
 * Backend status: token validation + quote submission endpoints aren't
 * mounted yet. The form here works as a complete UI specification —
 * once `GET /api/purchasing/rfqs/public/:token` and `POST
 * /api/purchasing/rfqs/public/submit` are wired in
 * backend/PROCUREMENT_PATCH_NOTES.md, this page calls them.
 *
 * Optional Excel upload (Tom's vision): suppliers paste a CSV row per
 * line or upload an XLSX template. We surface the textarea/upload
 * here; the parse happens on submit.
 */
export default function SupplierPortal() {
  const { platform } = useBranding();
  const nameWords = (platform.product_name || "Hub").split(" ");
  const nameTail = nameWords.length > 1 ? nameWords.pop() : "";
  const nameHead = nameWords.join(" ");
  const { token } = useParams();
  const [submitted, setSubmitted] = useState(false);
  // Per-line quote inputs keyed by line index. Boxes start empty (undefined).
  const [unitPrices, setUnitPrices] = useState<
    Record<number, number | undefined>
  >({});
  const [leadTimes, setLeadTimes] = useState<
    Record<number, number | undefined>
  >({});

  // TODO when backend ready:
  // const { data: rfq, isLoading } = useQuery({ queryKey: ['rfq-portal', token], queryFn: () => fetchRFQByToken(token!) });

  // For now, a tasteful mock showing the design.
  const rfq = {
    rfq_number: "JWL-RFQ-0042",
    title: "Q2 raw materials · 18k yellow gold blanks",
    business_name: "Hub Jewelry Ltd",
    response_deadline: "2026-06-12",
    notes:
      "Looking for high-quality blanks for the bridal collection. Free shipping to Lagos preferred.",
    lines: [
      {
        line_id: "L1",
        description: "18k Yellow Gold Ring Blanks · size 6",
        quantity_needed: 50,
        notes: "",
      },
      {
        line_id: "L2",
        description: "18k Yellow Gold Necklace Chains · 45cm",
        quantity_needed: 30,
        notes: "Solid links, not hollow",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-brand-black text-brand-cream bg-grid-noise font-body">
      {/* Header */}
      <header className="border-b border-brand-graphite">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-brand-accent/40 flex items-center justify-center">
              <span className="font-display text-brand-accent">O</span>
            </div>
            <div>
              <div className="font-display text-brand-cream text-lg">
                {nameHead}{" "}
                {nameTail && <span className="text-brand-accent">{nameTail}</span>}
              </div>
              <div className="text-[0.6rem] text-brand-smoke uppercase tracking-widest">
                Supplier Portal
              </div>
            </div>
          </div>
          <div className="text-right text-[0.65rem] text-brand-smoke font-mono">
            Token:{" "}
            <span className="text-brand-accent">{token?.slice(0, 8)}…</span>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {submitted ? (
          <Card className="p-8 sm:p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-accent2/20 text-accent2 flex items-center justify-center mx-auto mb-5">
              <Check className="w-7 h-7" />
            </div>
            <h1 className="font-display text-3xl text-brand-cream mb-2">
              Thank you
            </h1>
            <p className="text-sm text-brand-cloud max-w-md mx-auto">
              Your quote has been received. The buyer will be in touch within{" "}
              {rfq.response_deadline
                ? `before ${rfq.response_deadline}`
                : "5 business days"}
              .
            </p>
          </Card>
        ) : (
          <>
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-charcoal border border-brand-graphite text-[0.6rem] uppercase tracking-widest text-brand-smoke mb-3">
                <Building2 className="w-2.5 h-2.5" /> {rfq.business_name}
              </div>
              <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
                {rfq.title}
              </h1>
              <div className="text-xs text-brand-smoke font-mono mt-2">
                {rfq.rfq_number}
              </div>
              {rfq.notes && (
                <p className="mt-4 text-sm text-brand-cloud">{rfq.notes}</p>
              )}
              {rfq.response_deadline && (
                <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-state-warn">
                  <AlertCircle className="w-3.5 h-3.5" /> Submit by{" "}
                  {rfq.response_deadline}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.04] p-4 mb-6 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-brand-accent shrink-0 mt-0.5" />
              <div className="text-sm text-brand-cloud">
                <strong className="text-brand-cream">How this works:</strong>{" "}
                fill in your unit price, lead time, and any notes for each line.
                Submit when ready. You can also upload an XLSX with the same
                structure if you prefer.
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Unit price was a required field — keep that gate.
                const missingPrice = rfq.lines.some(
                  (_, i) => unitPrices[i] === undefined,
                );
                if (missingPrice) {
                  showToast.error("Enter a unit price for every line");
                  return;
                }
                setSubmitted(true);
              }}
              className="space-y-4"
            >
              {rfq.lines.map((line, i) => (
                <Card key={line.line_id} className="p-4 sm:p-5">
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[0.6rem] uppercase tracking-widest text-brand-smoke font-mono">
                        Line {i + 1}
                      </span>
                      <span className="text-[0.6rem] uppercase tracking-widest text-brand-accent">
                        Need {line.quantity_needed} units
                      </span>
                    </div>
                    <h3 className="font-medium text-brand-cream">
                      {line.description}
                    </h3>
                    {line.notes && (
                      <p className="text-xs text-brand-smoke mt-1">
                        {line.notes}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px]">
                    <NumberField
                      surface="dark"
                      decimal
                      label="Your unit price"
                      placeholder="0.00"
                      value={unitPrices[i]}
                      onValueChange={(v) =>
                        setUnitPrices((p) => ({ ...p, [i]: v }))
                      }
                    />
                    <Select
                      surface="dark"
                      label="Currency"
                      options={CURRENCIES.map((c) => ({
                        value: c.code,
                        label: c.code,
                      }))}
                      defaultValue="USD"
                    />
                    <NumberField
                      surface="dark"
                      label="Lead time (days)"
                      placeholder="14"
                      value={leadTimes[i]}
                      onValueChange={(v) =>
                        setLeadTimes((p) => ({ ...p, [i]: v }))
                      }
                    />
                  </div>
                  <Textarea
                    surface="dark"
                    label="Notes (optional)"
                    rows={2}
                    className="mt-3"
                    placeholder="Special terms, MOQ, etc."
                  />
                </Card>
              ))}

              <Card className="p-4 sm:p-5">
                <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke mb-2">
                  Or upload an XLSX
                </div>
                <label className="rounded-xl border-2 border-dashed border-brand-graphite p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-accent/40 transition-colors">
                  <ArrowDown className="w-5 h-5 text-brand-smoke" />
                  <span className="text-sm text-brand-cream">
                    Drop an XLSX file or click to browse
                  </span>
                  <span className="text-[0.65rem] text-brand-smoke">
                    We'll parse it and pre-fill the line items above
                  </span>
                  <input type="file" accept=".xlsx,.csv" hidden />
                </label>
              </Card>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="gold"
                  size="lg"
                  leftIcon={<Send className="w-4 h-4" />}
                >
                  Submit quote
                </Button>
              </div>
            </form>
          </>
        )}
      </div>

      <footer className="border-t border-brand-graphite mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 text-[0.6rem] text-brand-smoke text-center">
          Powered by {platform.product_name} · Secure supplier portal
        </div>
      </footer>
    </div>
  );
}
