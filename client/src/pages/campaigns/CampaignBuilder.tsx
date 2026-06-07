/**
 * CampaignBuilder — multi-step wizard for creating and configuring campaigns.
 * Steps: Details → Audience → Content → Schedule → Review
 * Settings tab (Q9: C) for approval threshold, daily limits, defaults.
 * Route: /campaigns/new and /campaigns/:id/edit
 */
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
import {
  createCampaign,
  updateCampaign,
  getCampaign,
  buildAudience,
  scheduleCampaign,
  sendNow,
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
import type { AudienceFilter } from "@typedefs/campaigns";

type Step = "details" | "audience" | "content" | "schedule" | "review";

export default function CampaignBuilder() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("details");
  const [campaignId, setCampaignId] = useState<string | null>(id ?? null);
  const [audienceCount, setAudienceCount] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

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
      from_name: "Orika Hub",
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
    }
  }, [existing]);

  const campaignType = form.watch("campaign_type");
  const audienceFilter = form.watch("audience_filter") as AudienceFilter;

  // Save draft on each step transition
  async function saveProgress(values: Partial<CreateCampaignValues>) {
    setSaving(true);
    try {
      if (!campaignId) {
        const campaign = await createCampaign(values as CreateCampaignValues);
        setCampaignId(campaign.campaign_id);
      } else {
        await updateCampaign(campaignId, values);
      }
    } catch (err) {
      showToast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    const values = form.getValues();
    if (step === "details") {
      const valid = await form.trigger(["campaign_name", "campaign_type"]);
      if (!valid) return;
      await saveProgress({
        campaign_name: values.campaign_name,
        campaign_type: values.campaign_type,
        subject_line: values.subject_line,
        from_name: values.from_name,
      });
      setStep("audience");
    } else if (step === "audience") {
      if (!campaignId) return;
      await saveProgress({ audience_filter: values.audience_filter });
      const result = await buildAudience(campaignId);
      setAudienceCount(result.recipient_count);
      setStep("content");
    } else if (step === "content") {
      if (!values.html_content.trim()) {
        form.setError("html_content", { message: "Content required" });
        return;
      }
      await saveProgress({ html_content: values.html_content });
      setStep("schedule");
    } else if (step === "schedule") {
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
    <div className="min-h-screen bg-orika-black">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {CAMPAIGN_STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all",
                  i < stepIndex
                    ? "bg-orika-gold text-orika-black"
                    : i === stepIndex
                      ? "border-2 border-orika-gold text-orika-gold bg-transparent"
                      : "border border-white/10 text-orika-smoke/40",
                )}
              >
                {i < stepIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs hidden sm:block",
                  i === stepIndex
                    ? "text-orika-cream font-medium"
                    : "text-orika-smoke/40",
                )}
              >
                {s.label}
              </span>
              {i < CAMPAIGN_STEPS.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-orika-smoke/20" />
              )}
            </div>
          ))}
          {saving && (
            <span className="ml-auto text-xs text-orika-smoke/60">Saving…</span>
          )}
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-white/5 bg-orika-charcoal p-6 space-y-5">
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
                  <Controller
                    name="subject_line"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="Email Subject Line"
                        placeholder="e.g. ✨ New Arrivals — Just for You, {{customer_name}}"
                        surface="dark"
                        hint="Use {{customer_name}} for personalisation"
                      />
                    )}
                  />
                  <Controller
                    name="from_name"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="From Name"
                        placeholder="e.g. Bejewelled"
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
                onChange={(f) => form.setValue("audience_filter", f)}
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
                    ? "Write your email HTML or paste from your email tool."
                    : "Write your WhatsApp message. Templates must be pre-approved by Meta."
                }
              />

              {/* Variable reference */}
              <div className="flex flex-wrap gap-1.5">
                <p className="w-full text-xs text-orika-smoke/60 mb-1">
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
                    className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-orika-smoke hover:text-orika-gold hover:border-orika-gold/30 transition-colors font-mono"
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
                    <label className="block text-[0.7rem] font-medium uppercase tracking-widest text-orika-smoke mb-2">
                      {campaignType === "email"
                        ? "HTML Content *"
                        : "Message *"}
                    </label>
                    <textarea
                      {...field}
                      placeholder={
                        campaignType === "email"
                          ? "<html>...</html> or paste your email builder output here"
                          : "Hi {{customer_name}}, we have something special for you at Bejewelled..."
                      }
                      className="w-full rounded-xl border border-white/10 bg-orika-graphite/30 p-4 text-sm text-orika-cream placeholder-orika-smoke/40 focus:border-orika-gold/40 focus:outline-none font-mono"
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
                      ? "border-orika-gold/60 bg-orika-gold/5"
                      : "border-white/5 hover:border-white/15",
                  )}
                >
                  <Send
                    className={cn(
                      "h-6 w-6",
                      scheduleMode === "now"
                        ? "text-orika-gold"
                        : "text-orika-smoke",
                    )}
                  />
                  <p
                    className={cn(
                      "text-sm font-medium",
                      scheduleMode === "now"
                        ? "text-orika-gold"
                        : "text-orika-cream",
                    )}
                  >
                    Send Now
                  </p>
                  <p className="text-xs text-orika-smoke">
                    Goes out immediately
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode("later")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl border p-5 transition-all",
                    scheduleMode === "later"
                      ? "border-orika-gold/60 bg-orika-gold/5"
                      : "border-white/5 hover:border-white/15",
                  )}
                >
                  <Clock
                    className={cn(
                      "h-6 w-6",
                      scheduleMode === "later"
                        ? "text-orika-gold"
                        : "text-orika-smoke",
                    )}
                  />
                  <p
                    className={cn(
                      "text-sm font-medium",
                      scheduleMode === "later"
                        ? "text-orika-gold"
                        : "text-orika-cream",
                    )}
                  >
                    Schedule
                  </p>
                  <p className="text-xs text-orika-smoke">
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
      <h2 className="text-lg font-semibold text-orika-cream">{title}</h2>
      <p className="text-sm text-orika-smoke mt-1">{subtitle}</p>
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
      <span className="text-orika-smoke">{label}</span>
      <span
        className={cn(
          "font-medium",
          highlight ? "text-orika-gold" : "text-orika-cream",
        )}
      >
        {value}
      </span>
    </div>
  );
}
