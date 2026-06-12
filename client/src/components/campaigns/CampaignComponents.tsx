/**
 * CampaignComponents.tsx
 * Exports: CampaignStatusBadge, CampaignTypePill, CampaignStatsPanel,
 *          AudienceBuilder, AudiencePreviewBar, FollowUpList
 */
import { useState, useEffect } from "react";
import {
  Users,
  Tag,
  AlertTriangle,
  Mail,
  MessageSquare,
  UserCheck,
} from "lucide-react";
import { Badge } from "@components/ui/Badge";
import { Button } from "@components/ui/Button";
import { Select } from "@components/ui/Select";
import {
  CAMPAIGN_STATUS_META,
  CAMPAIGN_TYPE_META,
  CONTACT_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  LAST_PURCHASE_OPTIONS,
  WA_DAILY_LIMIT_DEFAULT,
  WA_WARN_THRESHOLD_PCT,
} from "@lib/constants/campaignsConstants";
import { previewAudience } from "@services/campaigns";
import { cn } from "@lib/cn";
import type {
  CampaignStatus,
  CampaignType,
  CampaignStats,
  AudienceFilter,
  FollowUpSuggestion,
} from "@typedefs/campaigns";

// ── Badges ────────────────────────────────────────────────────────────────────

export function CampaignStatusBadge({
  status,
  size = "sm",
}: {
  status: CampaignStatus;
  size?: "xs" | "sm";
}) {
  const meta = CAMPAIGN_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}

export function CampaignTypePill({ type }: { type: CampaignType }) {
  const meta = CAMPAIGN_TYPE_META[type];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
      style={{
        color: meta.color,
        borderColor: `${meta.color}40`,
        backgroundColor: `${meta.color}14`,
      }}
    >
      {meta.icon} {meta.label}
    </span>
  );
}

// ── CampaignStatsPanel ────────────────────────────────────────────────────────

interface StatsPanelProps {
  stats: CampaignStats;
  type: CampaignType;
  currency?: string;
}

export function CampaignStatsPanel({
  stats,
  type,
  currency: _currency = "NGN",
}: StatsPanelProps) {
  const isEmail = type === "email";

  const cards = [
    {
      label: "Recipients",
      value: stats.total_recipients?.toLocaleString() ?? "0",
      color: "#9E9891",
    },
    {
      label: "Delivered",
      value: stats.delivered?.toLocaleString() ?? "0",
      sub: `${stats.delivery_rate ?? 0}% delivery rate`,
      color: "#4E9AF1",
    },
    ...(isEmail
      ? [
          {
            label: "Opened",
            value: stats.opened?.toLocaleString() ?? "0",
            sub: `${stats.open_rate_pct ?? 0}% open rate`,
            color: "#C9A86C",
          },
          {
            label: "Clicked",
            value: stats.clicked?.toLocaleString() ?? "0",
            sub: `${stats.click_rate_pct ?? 0}% click rate`,
            color: "#2D6A4F",
          },
        ]
      : [
          {
            label: "Replied",
            value: "—",
            sub: "Via WhatsApp inbox",
            color: "#25D366",
          },
        ]),
    {
      label: "Bounced",
      value: stats.bounced?.toLocaleString() ?? "0",
      color: "#EF4444",
    },
    {
      label: "Unsubscribed",
      value: stats.unsubscribed?.toLocaleString() ?? "0",
      color: "#9E9891",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3"
        >
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
            {card.label}
          </p>
          <p
            className="font-display text-2xl font-light tabular-nums"
            style={{ color: card.color }}
          >
            {card.value}
          </p>
          {card.sub && (
            <p className="text-[10px] text-brand-smoke mt-0.5">{card.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── AudiencePreviewBar ────────────────────────────────────────────────────────

export function AudiencePreviewBar({
  count,
  loading,
  waDailyLimit = WA_DAILY_LIMIT_DEFAULT,
  campaignType,
}: {
  count: number;
  loading: boolean;
  waDailyLimit?: number;
  campaignType: CampaignType;
}) {
  const isNearLimit =
    campaignType === "whatsapp" && count > waDailyLimit * WA_WARN_THRESHOLD_PCT;
  const isOverLimit = campaignType === "whatsapp" && count > waDailyLimit;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
        isOverLimit
          ? "border-state-danger/30 bg-state-danger/5"
          : isNearLimit
            ? "border-amber-500/30 bg-amber-900/10"
            : "border-white/10 bg-brand-charcoal",
      )}
    >
      <Users
        className={cn(
          "h-4 w-4 shrink-0",
          isOverLimit
            ? "text-state-danger"
            : isNearLimit
              ? "text-amber-400"
              : "text-brand-accent",
        )}
      />
      {loading ? (
        <span className="text-brand-smoke">Calculating audience…</span>
      ) : (
        <span
          className={
            isOverLimit
              ? "text-state-danger"
              : isNearLimit
                ? "text-amber-400"
                : "text-brand-cream"
          }
        >
          <strong className="tabular-nums">{count.toLocaleString()}</strong>{" "}
          contacts match
          {campaignType === "whatsapp" &&
            ` (limit: ${waDailyLimit.toLocaleString()}/day)`}
        </span>
      )}
      {isOverLimit && (
        <div className="ml-auto flex items-center gap-1 text-xs text-state-danger">
          <AlertTriangle className="h-3.5 w-3.5" />
          Exceeds WhatsApp daily limit — split into multiple campaigns
        </div>
      )}
      {isNearLimit && !isOverLimit && (
        <div className="ml-auto flex items-center gap-1 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Approaching daily limit
        </div>
      )}
    </div>
  );
}

// ── AudienceBuilder ───────────────────────────────────────────────────────────

interface AudienceBuilderProps {
  value: AudienceFilter;
  onChange: (filter: AudienceFilter) => void;
  campaignType: CampaignType;
  onPreviewCount?: (count: number) => void;
}

export function AudienceBuilder({
  value,
  onChange,
  campaignType,
  onPreviewCount,
}: AudienceBuilderProps) {
  const [tagInput, setTagInput] = useState("");
  const [preview, setPreview] = useState<{ count: number; loading: boolean }>({
    count: 0,
    loading: false,
  });

  // Live preview — debounced. try/catch is critical: an unhandled rejection
  // inside a setTimeout async callback causes React to unmount the component,
  // which is why the audience step was going blank on any API error.
  useEffect(() => {
    setPreview((p) => ({ ...p, loading: true }));
    const t = setTimeout(async () => {
      try {
        const result = await previewAudience(value, campaignType);
        // Backend returns { total, sample, filter_summary } — not { count }
        const count = result.total ?? result.count ?? 0;
        setPreview({ count, loading: false });
        onPreviewCount?.(count);
      } catch {
        // On error just stop the spinner — don't crash the component
        setPreview((p) => ({ ...p, loading: false }));
      }
    }, 600);
    return () => clearTimeout(t);
  }, [JSON.stringify(value), campaignType]);

  // All filter mutations go through updateInclude / updateExclude so the shape
  // always matches what compileFilter() in builder.service.js expects:
  //   { include: { contact_type, priority_level, tag_names, purchased_within_days },
  //     exclude: { unsubscribed, received_campaign_in_days },
  //     channel_requirements }
  function updateInclude(patch: Record<string, unknown>) {
    onChange({ ...value, include: { ...(value.include ?? {}), ...patch } });
  }
  function updateExclude(patch: Record<string, unknown>) {
    onChange({ ...value, exclude: { ...(value.exclude ?? {}), ...patch } });
  }
  function updateRoot(patch: Partial<AudienceFilter>) {
    onChange({ ...value, ...patch });
  }

  function toggleContactType(type: string) {
    const current = value.include?.contact_type ?? [];
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    updateInclude({ contact_type: next });
  }

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t) return;
    // Backend reads include.tag_names — NOT the flat filter.tags key
    const current = value.include?.tag_names ?? [];
    if (!current.includes(t)) updateInclude({ tag_names: [...current, t] });
    setTagInput("");
  }

  function removeTag(tag: string) {
    const current = value.include?.tag_names ?? [];
    updateInclude({ tag_names: current.filter((t) => t !== tag) });
  }

  return (
    <div className="space-y-5">
      {/* Live count */}
      <AudiencePreviewBar
        count={preview.count}
        loading={preview.loading}
        campaignType={campaignType}
      />

      {/* Quick pick — the common "email my newsletter subscribers" case in one tap */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          Quick Audiences
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                include: { ...(value.include ?? {}), contact_type: ["subscriber"] },
                exclude: { ...(value.exclude ?? {}), unsubscribed: true },
                channel_requirements: "email",
              })
            }
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all",
              value.include?.contact_type?.length === 1 &&
                value.include.contact_type[0] === "subscriber"
                ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                : "border-white/10 text-brand-smoke hover:border-white/25",
            )}
          >
            Newsletter subscribers
          </button>
        </div>
      </div>

      {/* Contact type chips */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          Contact Type
        </p>
        <div className="flex flex-wrap gap-2">
          {CONTACT_TYPE_OPTIONS.map((opt) => {
            const selected = (value.include?.contact_type ?? []).includes(
              opt.value,
            );
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleContactType(opt.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  selected
                    ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                    : "border-white/10 text-brand-smoke hover:border-white/25",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority */}
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Priority Level"
          options={PRIORITY_OPTIONS}
          // Backend reads include.priority_level as an array
          value={value.include?.priority_level?.[0] ?? ""}
          surface="dark"
          onChange={(e) =>
            updateInclude({
              priority_level: e.target.value ? [e.target.value] : undefined,
            })
          }
        />

        <Select
          label="Last Purchase"
          options={LAST_PURCHASE_OPTIONS}
          // Backend reads include.purchased_within_days (not flat last_purchase_days)
          value={String(value.include?.purchased_within_days ?? "")}
          surface="dark"
          onChange={(e) =>
            updateInclude({
              purchased_within_days: e.target.value
                ? parseInt(e.target.value)
                : undefined,
            })
          }
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          Tags{" "}
          <span className="normal-case font-normal">
            (must have any of these)
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(value.include?.tag_names ?? []).map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-brand-accent/15 border border-brand-accent/30 px-2 py-0.5 text-xs text-brand-accent"
            >
              <Tag className="h-3 w-3" />
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="ml-0.5 text-brand-accent/60 hover:text-brand-accent"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            placeholder="Type a tag and press Enter"
            className="flex-1 rounded-xl border border-white/10 bg-brand-charcoal px-3 py-2 text-sm text-brand-cream placeholder-brand-smoke/40 focus:border-brand-accent/40 focus:outline-none"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => addTag(tagInput)}
            disabled={!tagInput.trim()}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Channel requirements — maps to channel_requirements field read by compileFilter */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          Must Have
        </p>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={value.channel_requirements === "whatsapp"}
              onChange={(e) =>
                updateRoot({
                  channel_requirements: e.target.checked ? "whatsapp" : "auto",
                })
              }
              className="rounded"
            />
            <MessageSquare className="h-4 w-4 text-[#25D366]" />
            WhatsApp number
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={value.channel_requirements === "email"}
              onChange={(e) =>
                updateRoot({
                  channel_requirements: e.target.checked ? "email" : "auto",
                })
              }
              className="rounded"
            />
            <Mail className="h-4 w-4 text-[#4E9AF1]" />
            Email address
          </label>
        </div>
      </div>

      {/* Opt-out exclusion — backend reads exclude.unsubscribed (nested), not flat exclude_unsubscribed */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={value.exclude?.unsubscribed !== false}
          onChange={(e) =>
            updateExclude({ unsubscribed: e.target.checked })
          }
          className="rounded"
        />
        <span className="text-brand-cloud">
          Exclude contacts who previously unsubscribed{" "}
          <span className="text-brand-smoke">(recommended)</span>
        </span>
      </label>
    </div>
  );
}

// ── FollowUpList ──────────────────────────────────────────────────────────────

export function FollowUpList({
  suggestions,
}: {
  suggestions: FollowUpSuggestion[];
}) {
  if (!suggestions.length)
    return (
      <p className="text-sm text-brand-smoke">
        No follow-up suggestions for this campaign.
      </p>
    );

  return (
    <div className="space-y-2">
      <p className="text-xs text-brand-smoke/60 mb-3">
        These VIP customers opened your campaign multiple times but didn't click
        — a personal follow-up call may close the sale.
      </p>
      {suggestions.map((s) => (
        <div
          key={s.contact_id}
          className="flex items-center gap-4 rounded-xl border border-white/5 bg-brand-charcoal px-4 py-3"
        >
          <div className="h-8 w-8 rounded-full bg-brand-accent/15 flex items-center justify-center shrink-0">
            <UserCheck className="h-4 w-4 text-brand-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-brand-cream">
              {s.display_name}
            </p>
            <p className="text-xs text-brand-smoke">{s.reason}</p>
          </div>
          <div className="text-right">
            {s.primary_phone && (
              <p className="text-xs text-brand-cloud">{s.primary_phone}</p>
            )}
            <Badge tone="gold" size="xs">
              VIP · Opened {s.open_count}×
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
