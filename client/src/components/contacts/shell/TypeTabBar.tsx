import { LayoutGrid } from "lucide-react";
import {
  CONTACT_TYPE_META,
  CONTACT_TYPE_ORDER,
} from "@lib/constants/contactTypes";
import type { ContactType } from "@typedefs/contacts";
import { cn } from "@lib/cn";

type TabKey = "all" | ContactType;

interface Props {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  counts?: Partial<Record<TabKey, number>>;
}

export function TypeTabBar({ active, onChange, counts = {} }: Props) {
  const tabs: {
    key: TabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    ring?: string;
  }[] = [
    { key: "all", label: "All", icon: LayoutGrid },
    ...CONTACT_TYPE_ORDER.map((t) => ({
      key: t as TabKey,
      label: CONTACT_TYPE_META[t].shortLabel,
      icon: CONTACT_TYPE_META[t].icon,
      ring: CONTACT_TYPE_META[t].ringColor,
    })),
  ];

  return (
    <div
      role="tablist"
      className="flex overflow-x-auto hide-scrollbar -mx-1 px-1"
    >
      <div className="inline-flex p-1 gap-1 rounded-xl bg-orika-charcoal border border-orika-graphite">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          const c = counts[t.key];
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.key)}
              className={cn(
                "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg whitespace-nowrap text-xs font-semibold uppercase tracking-wide transition-all",
                isActive
                  ? "bg-orika-cream text-orika-black shadow-card"
                  : "text-orika-smoke hover:text-orika-cream",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              {typeof c === "number" && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[0.6rem] font-bold",
                    isActive
                      ? "bg-orika-black/10 text-orika-black"
                      : "bg-orika-graphite text-orika-cloud",
                  )}
                >
                  {c}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
