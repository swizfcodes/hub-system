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
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { Select } from "@components/ui/Select";
import { CURRENCIES } from "@lib/constants/currencies";

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
  const { token } = useParams();
  const [submitted, setSubmitted] = useState(false);

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
    <div className="min-h-screen bg-orika-black text-orika-cream bg-grid-noise font-body">
      {/* Header */}
      <header className="border-b border-orika-graphite">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-orika-gold/40 flex items-center justify-center">
              <span className="font-display text-orika-gold">O</span>
            </div>
            <div>
              <div className="font-display text-orika-cream text-lg">
                Orika <span className="text-orika-gold">Hub</span>
              </div>
              <div className="text-[0.6rem] text-orika-smoke uppercase tracking-widest">
                Supplier Portal
              </div>
            </div>
          </div>
          <div className="text-right text-[0.65rem] text-orika-smoke font-mono">
            Token:{" "}
            <span className="text-orika-gold">{token?.slice(0, 8)}…</span>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {submitted ? (
          <Card className="p-8 sm:p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-living-sage/20 text-living-sage flex items-center justify-center mx-auto mb-5">
              <Check className="w-7 h-7" />
            </div>
            <h1 className="font-display text-3xl text-orika-cream mb-2">
              Thank you
            </h1>
            <p className="text-sm text-orika-cloud max-w-md mx-auto">
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
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orika-charcoal border border-orika-graphite text-[0.6rem] uppercase tracking-widest text-orika-smoke mb-3">
                <Building2 className="w-2.5 h-2.5" /> {rfq.business_name}
              </div>
              <h1 className="font-display font-light text-3xl sm:text-4xl text-orika-cream">
                {rfq.title}
              </h1>
              <div className="text-xs text-orika-smoke font-mono mt-2">
                {rfq.rfq_number}
              </div>
              {rfq.notes && (
                <p className="mt-4 text-sm text-orika-cloud">{rfq.notes}</p>
              )}
              {rfq.response_deadline && (
                <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-state-warn">
                  <AlertCircle className="w-3.5 h-3.5" /> Submit by{" "}
                  {rfq.response_deadline}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-orika-gold/30 bg-orika-gold/[0.04] p-4 mb-6 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-orika-gold shrink-0 mt-0.5" />
              <div className="text-sm text-orika-cloud">
                <strong className="text-orika-cream">How this works:</strong>{" "}
                fill in your unit price, lead time, and any notes for each line.
                Submit when ready. You can also upload an XLSX with the same
                structure if you prefer.
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
              className="space-y-4"
            >
              {rfq.lines.map((line, i) => (
                <Card key={line.line_id} className="p-4 sm:p-5">
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[0.6rem] uppercase tracking-widest text-orika-smoke font-mono">
                        Line {i + 1}
                      </span>
                      <span className="text-[0.6rem] uppercase tracking-widest text-orika-gold">
                        Need {line.quantity_needed} units
                      </span>
                    </div>
                    <h3 className="font-medium text-orika-cream">
                      {line.description}
                    </h3>
                    {line.notes && (
                      <p className="text-xs text-orika-smoke mt-1">
                        {line.notes}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px]">
                    <Input
                      surface="dark"
                      type="number"
                      step="0.01"
                      label="Your unit price"
                      placeholder="0.00"
                      required
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
                    <Input
                      surface="dark"
                      type="number"
                      label="Lead time (days)"
                      placeholder="14"
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
                <div className="text-[0.6rem] uppercase tracking-widest text-orika-smoke mb-2">
                  Or upload an XLSX
                </div>
                <label className="rounded-xl border-2 border-dashed border-orika-graphite p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-orika-gold/40 transition-colors">
                  <ArrowDown className="w-5 h-5 text-orika-smoke" />
                  <span className="text-sm text-orika-cream">
                    Drop an XLSX file or click to browse
                  </span>
                  <span className="text-[0.65rem] text-orika-smoke">
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

      <footer className="border-t border-orika-graphite mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 text-[0.6rem] text-orika-smoke text-center">
          Powered by Orika Hub · Secure supplier portal
        </div>
      </footer>
    </div>
  );
}
