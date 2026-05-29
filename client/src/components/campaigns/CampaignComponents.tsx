/**
 * CampaignComponents.tsx
 * Exports: CampaignStatusBadge, CampaignTypePill, CampaignStatsPanel,
 *          AudienceBuilder, AudiencePreviewBar, FollowUpList
 */
import { useState, useEffect } from 'react';
import { Users, Tag, AlertTriangle, Mail, MessageSquare, UserCheck } from 'lucide-react';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Select } from '@components/ui/Select';
import {
  CAMPAIGN_STATUS_META, CAMPAIGN_TYPE_META,
  CONTACT_TYPE_OPTIONS, PRIORITY_OPTIONS, LAST_PURCHASE_OPTIONS,
  WA_DAILY_LIMIT_DEFAULT, WA_WARN_THRESHOLD_PCT } from '@lib/constants/campaignsConstants';
import { previewAudience } from '@services/campaigns';
import { cn } from '@lib/cn';
import type { CampaignStatus, CampaignType, CampaignStats, AudienceFilter, FollowUpSuggestion } from '@typedefs/campaigns';

// ── Badges ────────────────────────────────────────────────────────────────────

export function CampaignStatusBadge({ status, size = 'sm' }: { status: CampaignStatus; size?: 'xs' | 'sm' }) {
  const meta = CAMPAIGN_STATUS_META[status];
  return <Badge tone={meta.tone} size={size} dot={meta.dot}>{meta.label}</Badge>;
}

export function CampaignTypePill({ type }: { type: CampaignType }) {
  const meta = CAMPAIGN_TYPE_META[type];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
      style={{ color: meta.color, borderColor: `${meta.color}40`, backgroundColor: `${meta.color}14` }}>
      {meta.icon} {meta.label}
    </span>
  );
}

// ── CampaignStatsPanel ────────────────────────────────────────────────────────

interface StatsPanelProps { stats: CampaignStats; type: CampaignType; currency?: string; }

export function CampaignStatsPanel({ stats, type, currency: _currency = 'NGN' }: StatsPanelProps) {
  const isEmail = type === 'email';

  const cards = [
    { label: 'Recipients',  value: stats.total_recipients?.toLocaleString() ?? '0', color: '#9E9891' },
    { label: 'Delivered',   value: stats.delivered?.toLocaleString() ?? '0',
      sub: `${stats.delivery_rate ?? 0}% delivery rate`, color: '#4E9AF1' },
    ...(isEmail ? [
      { label: 'Opened',  value: stats.opened?.toLocaleString() ?? '0',
        sub: `${stats.open_rate_pct ?? 0}% open rate`, color: '#C9A86C' },
      { label: 'Clicked', value: stats.clicked?.toLocaleString() ?? '0',
        sub: `${stats.click_rate_pct ?? 0}% click rate`, color: '#2D6A4F' },
    ] : [
      { label: 'Replied',  value: '—', sub: 'Via WhatsApp inbox', color: '#25D366' },
    ]),
    { label: 'Bounced', value: stats.bounced?.toLocaleString() ?? '0', color: '#EF4444' },
    { label: 'Unsubscribed', value: stats.unsubscribed?.toLocaleString() ?? '0', color: '#9E9891' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-white/5 bg-orika-charcoal px-4 py-3">
          <p className="text-[0.65rem] uppercase tracking-widest text-orika-smoke mb-1">{card.label}</p>
          <p className="font-display text-2xl font-light tabular-nums" style={{ color: card.color }}>
            {card.value}
          </p>
          {card.sub && <p className="text-[10px] text-orika-smoke mt-0.5">{card.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── AudiencePreviewBar ────────────────────────────────────────────────────────

export function AudiencePreviewBar({
  count, loading, waDailyLimit = WA_DAILY_LIMIT_DEFAULT, campaignType,
}: { count: number; loading: boolean; waDailyLimit?: number; campaignType: CampaignType }) {
  const isNearLimit = campaignType === 'whatsapp' && count > waDailyLimit * WA_WARN_THRESHOLD_PCT;
  const isOverLimit = campaignType === 'whatsapp' && count > waDailyLimit;

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
      isOverLimit ? 'border-state-danger/30 bg-state-danger/5'
        : isNearLimit ? 'border-amber-500/30 bg-amber-900/10'
        : 'border-white/10 bg-orika-charcoal',
    )}>
      <Users className={cn('h-4 w-4 shrink-0', isOverLimit ? 'text-state-danger' : isNearLimit ? 'text-amber-400' : 'text-orika-gold')} />
      {loading ? (
        <span className="text-orika-smoke">Calculating audience…</span>
      ) : (
        <span className={isOverLimit ? 'text-state-danger' : isNearLimit ? 'text-amber-400' : 'text-orika-cream'}>
          <strong className="tabular-nums">{count.toLocaleString()}</strong> contacts match
          {campaignType === 'whatsapp' && ` (limit: ${waDailyLimit.toLocaleString()}/day)`}
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
  value:         AudienceFilter;
  onChange:      (filter: AudienceFilter) => void;
  campaignType:  CampaignType;
  onPreviewCount?: (count: number) => void;
}

export function AudienceBuilder({ value, onChange, campaignType, onPreviewCount }: AudienceBuilderProps) {
  const [tagInput, setTagInput] = useState('');
  const [preview, setPreview] = useState<{ count: number; loading: boolean }>({ count: 0, loading: false });

  // Live preview — debounced
  useEffect(() => {
    setPreview((p) => ({ ...p, loading: true }));
    const t = setTimeout(async () => {
      const result = await previewAudience(value, campaignType);
      setPreview({ count: result.count, loading: false });
      onPreviewCount?.(result.count);
    }, 600);
    return () => clearTimeout(t);
  }, [JSON.stringify(value), campaignType]);

  function update(patch: Partial<AudienceFilter>) {
    onChange({ ...value, ...patch });
  }

  function toggleContactType(type: string) {
    const current = value.contact_type ?? [];
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    update({ contact_type: next });
  }

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t) return;
    const current = value.tags ?? [];
    if (!current.includes(t)) update({ tags: [...current, t] });
    setTagInput('');
  }

  function removeTag(tag: string) {
    update({ tags: (value.tags ?? []).filter((t) => t !== tag) });
  }

  return (
    <div className="space-y-5">
      {/* Live count */}
      <AudiencePreviewBar count={preview.count} loading={preview.loading} campaignType={campaignType} />

      {/* Contact type chips */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">Contact Type</p>
        <div className="flex flex-wrap gap-2">
          {CONTACT_TYPE_OPTIONS.map((opt) => {
            const selected = (value.contact_type ?? []).includes(opt.value);
            return (
              <button key={opt.value} type="button" onClick={() => toggleContactType(opt.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  selected
                    ? 'border-orika-gold bg-orika-gold/10 text-orika-gold'
                    : 'border-white/10 text-orika-smoke hover:border-white/25',
                )}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority */}
      <div className="grid grid-cols-2 gap-3">
        <Select label="Priority Level" options={PRIORITY_OPTIONS}
          value={value.priority_level ?? ''} surface="dark"
          onChange={(e) => update({ priority_level: e.target.value || undefined })} />

        <Select label="Last Purchase" options={LAST_PURCHASE_OPTIONS}
          value={String(value.last_purchase_days ?? '')} surface="dark"
          onChange={(e) => update({ last_purchase_days: e.target.value ? parseInt(e.target.value) : undefined })} />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">
          Tags <span className="normal-case font-normal">(must have any of these)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(value.tags ?? []).map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-orika-gold/15 border border-orika-gold/30 px-2 py-0.5 text-xs text-orika-gold">
              <Tag className="h-3 w-3" />
              {tag}
              <button onClick={() => removeTag(tag)} className="ml-0.5 text-orika-gold/60 hover:text-orika-gold">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="text" value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
            placeholder="Type a tag and press Enter"
            className="flex-1 rounded-xl border border-white/10 bg-orika-charcoal px-3 py-2 text-sm text-orika-cream placeholder-orika-smoke/40 focus:border-orika-gold/40 focus:outline-none" />
          <Button size="sm" variant="secondary" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>
            Add
          </Button>
        </div>
      </div>

      {/* Channel toggles */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">Must Have</p>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox"
              checked={value.has_whatsapp ?? false}
              onChange={(e) => update({ has_whatsapp: e.target.checked || undefined })}
              className="rounded" />
            <MessageSquare className="h-4 w-4 text-[#25D366]" />
            WhatsApp number
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox"
              checked={value.has_email ?? false}
              onChange={(e) => update({ has_email: e.target.checked || undefined })}
              className="rounded" />
            <Mail className="h-4 w-4 text-[#4E9AF1]" />
            Email address
          </label>
        </div>
      </div>

      {/* Opt-out exclusion */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox"
          checked={value.exclude_unsubscribed !== false}
          onChange={(e) => update({ exclude_unsubscribed: e.target.checked })}
          className="rounded" />
        <span className="text-orika-cloud">
          Exclude contacts who previously unsubscribed <span className="text-orika-smoke">(recommended)</span>
        </span>
      </label>
    </div>
  );
}

// ── FollowUpList ──────────────────────────────────────────────────────────────

export function FollowUpList({ suggestions }: { suggestions: FollowUpSuggestion[] }) {
  if (!suggestions.length) return (
    <p className="text-sm text-orika-smoke">No follow-up suggestions for this campaign.</p>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-orika-smoke/60 mb-3">
        These VIP customers opened your campaign multiple times but didn't click —
        a personal follow-up call may close the sale.
      </p>
      {suggestions.map((s) => (
        <div key={s.contact_id}
          className="flex items-center gap-4 rounded-xl border border-white/5 bg-orika-charcoal px-4 py-3">
          <div className="h-8 w-8 rounded-full bg-orika-gold/15 flex items-center justify-center shrink-0">
            <UserCheck className="h-4 w-4 text-orika-gold" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-orika-cream">{s.display_name}</p>
            <p className="text-xs text-orika-smoke">{s.reason}</p>
          </div>
          <div className="text-right">
            {s.primary_phone && <p className="text-xs text-orika-cloud">{s.primary_phone}</p>}
            <Badge tone="gold" size="xs">VIP · Opened {s.open_count}×</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
