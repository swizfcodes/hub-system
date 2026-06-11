// The "Today" work feed — every card is a reason for a salesperson
// to pick up the phone. Sourced from /crm/clients/today: birthdays
// and anniversaries coming up, fresh customers to welcome (walk-in,
// website, campaigns — any source), valuable clients gone quiet,
// this month's top spenders, quiet B2B deals and overdue invoices.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cake,
  HeartHandshake,
  Sparkles,
  MoonStar,
  Trophy,
  AlarmClock,
} from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { fmtMoney, fmtDate } from "@lib/format";
import type { TodayFeed } from "@typedefs/crm";
import { ClientAvatar, QuickReach, VipStar } from "./ClientBits";
import { cn } from "@lib/cn";

export function TodayStrip({
  feed,
  loading,
}: {
  feed?: TodayFeed;
  loading?: boolean;
}) {
  if (loading || !feed) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const followUpCount = feed.stale_deals.length + feed.overdue_invoices.length;
  const celebrationCount = feed.birthdays.length + feed.milestones.length;

  const sections: TodaySection[] = [
    {
      key: "celebrate",
      label: "To celebrate",
      icon: <Cake className="w-4 h-4" />,
      tone: "text-accent3 bg-accent3/15",
      count: celebrationCount,
      hint: "Birthdays & anniversaries",
      items: [
        ...feed.birthdays.map((b) => ({
          contactId: b.contact_id,
          name: b.display_name,
          phone: b.primary_phone,
          whatsapp: b.whatsapp_number,
          vip: b.is_vip,
          detail:
            b.days_away === 0
              ? "Birthday today 🎂"
              : `Birthday in ${b.days_away} day${b.days_away === 1 ? "" : "s"}`,
        })),
        ...feed.milestones.map((m) => ({
          contactId: m.contact_id,
          name: m.display_name,
          phone: m.primary_phone,
          whatsapp: m.whatsapp_number,
          detail: `${m.milestone_type.replace(/_/g, " ")} — ${fmtDate(m.next_date)}`,
        })),
      ],
    },
    {
      key: "welcome",
      label: "To welcome",
      icon: <Sparkles className="w-4 h-4" />,
      tone: "text-state-info bg-state-info/15",
      count: feed.to_welcome.length,
      hint: "New clients, every source",
      items: feed.to_welcome.map((c) => ({
        contactId: c.contact_id,
        name: c.display_name,
        phone: c.primary_phone,
        whatsapp: c.whatsapp_number,
        detail: c.source
          ? `via ${c.source.replace(/_/g, " ")}`
          : `joined ${fmtDate(c.created_at)}`,
      })),
    },
    {
      key: "winback",
      label: "To win back",
      icon: <MoonStar className="w-4 h-4" />,
      tone: "text-state-warn bg-state-warn/15",
      count: feed.lapsed.length,
      hint: "Gone quiet — call them",
      items: feed.lapsed.map((c) => ({
        contactId: c.contact_id,
        name: c.display_name,
        phone: c.primary_phone,
        whatsapp: c.whatsapp_number,
        vip: c.is_vip,
        detail: `${c.days_silent} days silent · ${fmtMoney(Number(c.total_spend), "NGN")} lifetime`,
      })),
    },
    {
      key: "top",
      label: "Top this month",
      icon: <Trophy className="w-4 h-4" />,
      tone: "text-brand-accent bg-brand-accent/15",
      count: feed.top_this_month.length,
      hint: "Deserve extra attention",
      items: feed.top_this_month.map((c) => ({
        contactId: c.contact_id,
        name: c.display_name,
        phone: c.primary_phone,
        whatsapp: c.whatsapp_number,
        vip: c.is_vip,
        detail: `${fmtMoney(Number(c.spend_this_month), "NGN")} this month`,
      })),
    },
    {
      key: "followups",
      label: "Follow-ups",
      icon: <AlarmClock className="w-4 h-4" />,
      tone: "text-state-danger bg-state-danger/15",
      count: followUpCount,
      hint: "Quiet deals & overdue invoices",
      items: [
        ...feed.stale_deals.map((d) => ({
          contactId: d.contact_id,
          name: d.display_name,
          detail: `Deal "${d.title}" quiet ${d.days_quiet}d`,
          dealId: d.deal_id,
        })),
        ...feed.overdue_invoices.map((i) => ({
          contactId: i.contact_id,
          name: i.display_name,
          detail: `${i.invoice_number} overdue ${i.days_overdue}d — ${fmtMoney(Number(i.amount_outstanding), "NGN")}`,
        })),
      ],
    },
  ];

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <HeartHandshake className="w-4 h-4 text-brand-accent" />
        <h2 className="text-[0.7rem] tracking-widest uppercase text-brand-smoke">
          Today — who to reach out to
        </h2>
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {sections.map((s) => (
          <TodayCard key={s.key} section={s} />
        ))}
      </div>
    </div>
  );
}

interface TodayItem {
  contactId: string;
  name: string;
  detail: string;
  phone?: string | null;
  whatsapp?: string | null;
  vip?: boolean;
  dealId?: string;
}

interface TodaySection {
  key: string;
  label: string;
  icon: React.ReactNode;
  tone: string;
  count: number;
  hint: string;
  items: TodayItem[];
}

function TodayCard({ section }: { section: TodaySection }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? section.items.slice(0, 8) : section.items.slice(0, 3);

  return (
    <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/60 p-3.5 flex flex-col">
      <button
        className="flex items-center justify-between w-full text-left"
        onClick={() => setExpanded((v) => !v)}
        disabled={section.items.length <= 3}
      >
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center justify-center w-7 h-7 rounded-lg",
              section.tone,
            )}
          >
            {section.icon}
          </span>
          <span>
            <span className="block text-[0.65rem] uppercase tracking-widest text-brand-smoke">
              {section.label}
            </span>
            <span className="block text-[0.6rem] text-brand-smoke/70">
              {section.hint}
            </span>
          </span>
        </span>
        <span className="text-lg font-display text-brand-cream tabular-nums">
          {section.count}
        </span>
      </button>

      {section.count === 0 ? (
        <p className="text-[0.65rem] text-brand-smoke/60 mt-3 italic">
          Nothing waiting — all caught up.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {visible.map((item, idx) => (
            <li
              key={`${item.contactId}-${idx}`}
              onClick={() =>
                navigate(
                  item.dealId
                    ? `/crm/${item.dealId}`
                    : `/crm/clients/${item.contactId}`,
                )
              }
              className="flex items-center gap-2 p-1.5 -mx-1.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
            >
              <ClientAvatar name={item.name} size="sm" />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1 text-xs text-brand-cream truncate">
                  {item.name} <VipStar isVip={item.vip} />
                </span>
                <span className="block text-[0.6rem] text-brand-smoke truncate">
                  {item.detail}
                </span>
              </span>
              <QuickReach phone={item.phone} whatsapp={item.whatsapp} />
            </li>
          ))}
        </ul>
      )}
      {section.items.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[0.6rem] uppercase tracking-wide text-brand-accent hover:text-brand-accent-glow self-start"
        >
          {expanded ? "Show less" : `Show all ${section.items.length}`}
        </button>
      )}
    </div>
  );
}
