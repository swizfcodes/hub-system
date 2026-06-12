/**
 * CampaignBuilder — multi-step wizard for creating and configuring campaigns.
 * Steps: Details → Audience → Content → Schedule → Review
 * Settings tab (Q9: C) for approval threshold, daily limits, defaults.
 * Route: /campaigns/new and /campaigns/:id/edit
 */
import { useBranding } from "@/providers/ThemeProvider";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, ChevronLeft, Check, Send, Clock } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import {
  AudienceBuilder,
  CampaignTypePill,
} from "@components/campaigns/CampaignComponents";
import { EmailStudio } from "@components/campaigns/EmailStudio";
import {
  compileEmailHtml,
  defaultDesign,
  designHasContent,
} from "@lib/emailStudio";
import {
  createCampaign,
  updateCampaign,
  getCampaign,
  buildAudience,
  scheduleCampaign,
  sendNow,
  sendTestEmail,
} from "@services/campaigns";
import {
  createCampaignSchema,
  type CreateCampaignValues,
} from "@lib/schemas/campaigns";
import {
  CAMPAIGN_TYPE_OPTIONS,
  CAMPAIGN_STEPS,
  TEMPLATE_VARIABLES,
} from "@lib/constants/campaignsConstants";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { AudienceFilter, EmailDesign } from "@typedefs/campaigns";

type Step = "details" | "audience" | "content" | "schedule" | "review";
type ContentMode = "studio" | "html";

export default function CampaignBuilder() {
  const { platform } = useBranding();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("details");
  const [campaignId, setCampaignId] = useState<string | null>(id ?? null);
  const [audienceCount, setAudienceCount] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  // Email content authoring: in-app block studio (default) or raw HTML.
  const [contentMode, setContentMode] = useState<ContentMode>("studio");
  const [design, setDesign] = useState<EmailDesign>(() => defaultDesign());
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => getCampaign(id!),
    enabled: !!id,
  });

  const form = useForm<CreateCampaignValues>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      campaign_name: "",
      campaign_type: "email",
      subject_line: "",
      from_name: platform.product_name,
      html_content: "",
      // Shape must match what compileFilter() in builder.service.js expects
      audience_filter: {
        include: {},
        exclude: { unsubscribed: true },
        channel_requirements: "auto",
      },
    },
  });

  useEffect(() => {
    if (existing) {
      form.reset({
        campaign_name: existing.campaign_name,
        campaign_type: existing.campaign_type,
        subject_line: existing.subject_line ?? "",
        from_name: existing.from_name ?? "",
        html_content: existing.html_content,
        audience_filter: existing.audience_filter,
      });
      // Re-open the studio for studio-built campaigns; legacy campaigns
      // with hand-written HTML stay in raw mode so we never clobber them.
      if (existing.design_json) {
        setDesign(existing.design_json);
        setContentMode("studio");
      } else if (existing.html_content?.trim()) {
        setContentMode("html");
      }
    }
  }, [existing]);

  const campaignType = form.watch("campaign_type");
  const audienceFilter = form.watch("audience_filter") as AudienceFilter;

  // Save draft on each step transition. Returns true on success so the
  // wizard NEVER advances past a failed save (which previously left
  // campaignId null and dead-ended the Audience step).
  async function saveProgress(
    values: Partial<CreateCampaignValues> & {
      design_json?: EmailDesign | null;
    },
  ): Promise<boolean> {
    setSaving(true);
    try {
      if (!campaignId) {
        const campaign = await createCampaign(values as CreateCampaignValues);
        setCampaignId(campaign.campaign_id);
      } else {
        await updateCampaign(campaignId, values);
      }
      return true;
    } catch (err) {
      showToast.error(errMsg(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    const values = form.getValues();
    if (step === "details") {
      const valid = await form.trigger(["campaign_name", "campaign_type"]);
      if (!valid) return;
      const saved = await saveProgress({
        campaign_name: values.campaign_name,
        campaign_type: values.campaign_type,
        subject_line: values.subject_line,
        from_name: values.from_name,
      });
      if (!saved) return;
      setStep("audience");
    } else if (step === "audience") {
      if (!campaignId) {
        // Defensive — should be unreachable now that Details can't be
        // passed without a successful save.
        showToast.error("Complete the Details step first");
        setStep("details");
        return;
      }
      const saved = await saveProgress({
        audience_filter: values.audience_filter,
      });
      if (!saved) return;
      try {
        const result = await buildAudience(campaignId);
        setAudienceCount(result.recipient_count);
      } catch (err) {
        showToast.error(errMsg(err));
        return;
      }
      setStep("content");
    } else if (step === "content") {
      if (campaignType === "email" && contentMode === "studio") {
        if (!designHasContent(design)) {
          showToast.error("Add at least one content block before continuing");
          return;
        }
        // Compile blocks → email-safe HTML. design_json is saved alongside
        // so the studio re-opens exactly as left.
        const html = compileEmailHtml(design);
        form.setValue("html_content", html);
        const saved = await saveProgress({
          html_content: html,
          design_json: design,
        });
        if (!saved) return;
        setStep("schedule");
        return;
      }
      if (!values.html_content.trim()) {
        form.setError("html_content", { message: "Content required" });
        return;
      }
      const saved = await saveProgress({
        html_content: values.html_content,
        design_json: null, // raw-HTML mode clears any stale studio design
      });
      if (!saved) return;
      setStep("schedule");
    } else if (step === "schedule") {
      if (scheduleMode === "later" && !scheduledAt) {
        showToast.error("Pick a send date and time, or choose Send Now");
        return;
      }
      setStep("review");
    }
  }

  function goPrev() {
    const steps: Step[] = [
      "details",
      "audience",
      "content",
      "schedule",
      "review",
    ];
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  }

  async function handleTestSend() {
    if (!campaignId) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) {
      showToast.error("Enter a valid email address for the test");
      return;
    }
    setTestSending(true);
    try {
      await sendTestEmail(campaignId, testEmail.trim());
      showToast.success(`Test email sent to ${testEmail.trim()}`);
    } catch (err) {
      showToast.error(errMsg(err));
    } finally {
      setTestSending(false);
    }
  }

  async function handleLaunch() {
    if (!campaignId) return;
    try {
      if (scheduleMode === "later" && scheduledAt) {
        await scheduleCampaign(campaignId, scheduledAt);
        showToast.success("Campaign scheduled successfully");
      } else {
        await sendNow(campaignId);
        showToast.success("Campaign is sending — check the campaign detail for live progress");
      }
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      navigate(`/campaigns/${campaignId}`);
    } catch (err) {
      showToast.error(errMsg(err));
    }
  }

  const stepIndex = CAMPAIGN_STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {CAMPAIGN_STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all",
                  i < stepIndex
                    ? "bg-brand-accent text-brand-black"
                    : i === stepIndex
                      ? "border-2 border-brand-accent text-brand-accent bg-transparent"
                      : "border border-white/10 text-brand-smoke/40",
                )}
              >
                {i < stepIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs hidden sm:block",
                  i === stepIndex
                    ? "text-brand-cream font-medium"
                    : "text-brand-smoke/40",
                )}
              >
                {s.label}
              </span>
              {i < CAMPAIGN_STEPS.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-brand-smoke/20" />
              )}
            </div>
          ))}
          {saving && (
            <span className="ml-auto text-xs text-brand-smoke/60">Saving…</span>
          )}
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6 space-y-5">
          {/* Step 1: Details */}
          {step === "details" && (
            <>
              <StepHeader
                title="Campaign Details"
                subtitle="Name your campaign and choose the channel."
              />
              <Controller
                name="campaign_type"
                control={form.control}
                render={({ field }) => (
                  <Select
                    label="Channel *"
                    options={CAMPAIGN_TYPE_OPTIONS}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    surface="dark"
                  />
                )}
              />
              <Controller
                name="campaign_name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Input
                    {...field}
                    label="Campaign Name *"
                    placeholder="e.g. January VIP Drop, Eid Promo"
                    surface="dark"
                    error={fieldState.error?.message}
                  />
                )}
              />
              {campaignType === "email" && (
                <>
                  <div>
                    <Controller
                      name="subject_line"
                      control={form.control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          label="Email Subject Line"
                          placeholder="e.g. ✨ New Arrivals — Just for You, {{customer_name}}"
                          surface="dark"
                          hint='Click a variable below to insert it. Contacts without a name get "Valued Customer".'
                        />
                      )}
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES.map((v) => (
                        <button
                          key={v.token}
                          type="button"
                          title={`${v.label} — e.g. ${v.example}`}
                          onClick={() => {
                            const current =
                              form.getValues("subject_line") ?? "";
                            const sep =
                              current && !current.endsWith(" ") ? " " : "";
                            form.setValue("subject_line", current + sep + v.token, {
                              shouldDirty: true,
                            });
                          }}
                          className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-brand-smoke hover:text-brand-accent hover:border-brand-accent/30 transition-colors font-mono"
                        >
                          {v.token}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Controller
                    name="from_name"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="From Name"
                        placeholder="e.g. your brand name"
                        surface="dark"
                      />
                    )}
                  />
                </>
              )}
            </>
          )}

          {/* Step 2: Audience */}
          {step === "audience" && (
            <>
              <StepHeader
                title="Choose Your Audience"
                subtitle="Build a segment or load a saved one."
              />
              <AudienceBuilder
                value={audienceFilter}
                onChange={(f) => form.setValue("audience_filter", f as any)}
                campaignType={campaignType}
                onPreviewCount={setAudienceCount}
              />
            </>
          )}

          {/* Step 3: Content */}
          {step === "content" && (
            <>
              <StepHeader
                title="Campaign Content"
                subtitle={
                  campaignType === "email"
                    ? contentMode === "studio"
                      ? "Design your email with blocks — no HTML needed."
                      : "Paste or write raw email HTML."
                    : "Write your WhatsApp message. Templates must be pre-approved by Meta."
                }
              />

              {/* Mode toggle — email only */}
              {campaignType === "email" && (
                <div className="flex gap-1 rounded-lg border border-white/10 p-1 w-fit">
                  {(
                    [
                      { key: "studio", label: "✨ Studio" },
                      { key: "html", label: "</> Raw HTML" },
                    ] as { key: ContentMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setContentMode(m.key)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        contentMode === m.key
                          ? "bg-brand-accent text-brand-black"
                          : "text-brand-smoke hover:text-brand-cream",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}

              {campaignType === "email" && contentMode === "studio" ? (
                <EmailStudio value={design} onChange={setDesign} />
              ) : (
                <>
                  {/* Variable reference */}
                  <div className="flex flex-wrap gap-1.5">
                    <p className="w-full text-xs text-brand-smoke/60 mb-1">
                      Available variables:
                    </p>
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        onClick={() => {
                          const current = form.getValues("html_content");
                          form.setValue("html_content", current + v.token);
                        }}
                        className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-brand-smoke hover:text-brand-accent hover:border-brand-accent/30 transition-colors font-mono"
                      >
                        {v.token}
                      </button>
                    ))}
                  </div>

                  <Controller
                    name="html_content"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <div>
                        <label className="block text-[0.7rem] font-medium uppercase tracking-widest text-brand-smoke mb-2">
                          {campaignType === "email"
                            ? "HTML Content *"
                            : "Message *"}
                        </label>
                        <textarea
                          {...field}
                          placeholder={
                            campaignType === "email"
                              ? "<html>...</html> or paste your email builder output here"
                              : "Hi {{customer_name}}, we have something special for you..."
                          }
                          className="w-full rounded-xl border border-white/10 bg-brand-graphite/30 p-4 text-sm text-brand-cream placeholder-brand-smoke/40 focus:border-brand-accent/40 focus:outline-none font-mono"
                          rows={12}
                        />
                        {fieldState.error && (
                          <p className="mt-1 text-xs text-state-danger">
                            {fieldState.error.message}
                          </p>
                        )}
                      </div>
                    )}
                  />
                </>
              )}
            </>
          )}

          {/* Step 4: Schedule */}
          {step === "schedule" && (
            <>
              <StepHeader
                title="When to Send"
                subtitle="Send immediately or schedule for later."
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScheduleMode("now")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl border p-5 transition-all",
                    scheduleMode === "now"
                      ? "border-brand-accent/60 bg-brand-accent/5"
                      : "border-white/5 hover:border-white/15",
                  )}
                >
                  <Send
                    className={cn(
                      "h-6 w-6",
                      scheduleMode === "now"
                        ? "text-brand-accent"
                        : "text-brand-smoke",
                    )}
                  />
                  <p
                    className={cn(
                      "text-sm font-medium",
                      scheduleMode === "now"
                        ? "text-brand-accent"
                        : "text-brand-cream",
                    )}
                  >
                    Send Now
                  </p>
                  <p className="text-xs text-brand-smoke">
                    Goes out immediately
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode("later")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl border p-5 transition-all",
                    scheduleMode === "later"
                      ? "border-brand-accent/60 bg-brand-accent/5"
                      : "border-white/5 hover:border-white/15",
                  )}
                >
                  <Clock
                    className={cn(
                      "h-6 w-6",
                      scheduleMode === "later"
                        ? "text-brand-accent"
                        : "text-brand-smoke",
                    )}
                  />
                  <p
                    className={cn(
                      "text-sm font-medium",
                      scheduleMode === "later"
                        ? "text-brand-accent"
                        : "text-brand-cream",
                    )}
                  >
                    Schedule
                  </p>
                  <p className="text-xs text-brand-smoke">
                    Pick a date and time
                  </p>
                </button>
              </div>
              {scheduleMode === "later" && (
                <Input
                  label="Send Date & Time *"
                  type="datetime-local"
                  surface="dark"
                  value={scheduledAt}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              )}
            </>
          )}

          {/* Step 5: Review */}
          {step === "review" && (
            <>
              <StepHeader
                title="Review & Launch"
                subtitle="Everything looks right? Launch the campaign."
              />
              <div className="space-y-3">
                <ReviewRow
                  label="Campaign"
                  value={form.getValues("campaign_name")}
                />
                <ReviewRow
                  label="Channel"
                  value={<CampaignTypePill type={campaignType} />}
                />
                {campaignType === "email" && (
                  <ReviewRow
                    label="Subject"
                    value={form.getValues("subject_line") || "—"}
                  />
                )}
                <ReviewRow
                  label="Recipients"
                  value={`${audienceCount.toLocaleString()} contacts`}
                  highlight={audienceCount > 0}
                />
                <ReviewRow
                  label="Send"
                  value={
                    scheduleMode === "now"
                      ? "Immediately"
                      : scheduledAt
                        ? new Date(scheduledAt).toLocaleString("en-NG")
                        : "Not set"
                  }
                />
              </div>
              {campaignType === "email" && (
                <div className="rounded-xl border border-white/5 bg-brand-graphite/30 p-4 space-y-3">
                  <p className="text-sm text-brand-cream font-medium">
                    Send yourself a test first
                  </p>
                  <p className="text-xs text-brand-smoke">
                    Sent exactly like the real campaign, with sample data in
                    the variables. No recipients are touched.
                  </p>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        surface="dark"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      onClick={handleTestSend}
                      loading={testSending}
                    >
                      <Send className="h-4 w-4" />
                      Send test
                    </Button>
                  </div>
                </div>
              )}
              {audienceCount === 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 px-4 py-3 text-sm text-amber-300">
                  Audience not built yet — go back to Audience step and click
                  Continue to build it.
                </div>
              )}
            </>
          )}
        </div>

        {/* Nav buttons */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={goPrev}
            disabled={step === "details"}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {step !== "review" ? (
            <Button onClick={goNext} loading={saving}>
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleLaunch} disabled={audienceCount === 0}>
              {scheduleMode === "now" ? (
                <>
                  <Send className="h-4 w-4" /> Send Campaign
                </>
              ) : (
                <>
                  <Clock className="h-4 w-4" /> Schedule Campaign
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-white/5 pb-4">
      <h2 className="text-lg font-semibold text-brand-cream">{title}</h2>
      <p className="text-sm text-brand-smoke mt-1">{subtitle}</p>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-2 text-sm">
      <span className="text-brand-smoke">{label}</span>
      <span
        className={cn(
          "font-medium",
          highlight ? "text-brand-accent" : "text-brand-cream",
        )}
      >
        {value}
      </span>
    </div>
  );
}
