import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { listBusinesses } from "@services/settings/businesses";
import { useBusinessStore } from "@stores/useBusinessStore";
import { useBusinessSwitchStore } from "@stores/useBusinessSwitchStore";
import { useAuthStore } from "@stores/useAuthStore";
import { cn } from "@lib/cn";

interface Props {
  variant?: "sidebar" | "topbar" | "compact";
}

const accentFor = (key: string): string => {
  // Loose mapping — we'll prefer the server's accent_colour once loaded.
  if (key === "jewelry") return "#B76E79";
  if (key === "diffusers") return "#8B9D77";
  return "#C9A86C";
};

export function BusinessSwitcher({ variant = "sidebar" }: Props) {
  const { active, setActive } = useBusinessStore();
  const requestSwitchFlow = useBusinessSwitchStore((s) => s.request);
  const user = useAuthStore((s) => s.user);
  const { data: businesses = [] } = useQuery({
    queryKey: ["settings", "businesses", "active"],
    queryFn: () => listBusinesses(false),
    staleTime: 5 * 60 * 1000,
  });

  // Filter to only those the user is permitted to access.
  const permitted = user?.permitted_businesses ?? [];
  const visible = businesses.filter(
    (b) => permitted.includes("*") || permitted.includes(b.business_key),
  );

  // Route a selection through the guarded switch (confirm → blurred 5s reload).
  // First-ever selection (no active yet) sets directly — nothing to reload.
  function requestSwitch(b: {
    business_key: string;
    display_name: string;
    accent_colour?: string | null;
  }) {
    if (b.business_key === active) return;
    if (!active) {
      setActive(b.business_key);
      return;
    }
    const from = visible.find((x) => x.business_key === active);
    requestSwitchFlow({
      fromKey: active,
      toKey: b.business_key,
      fromName: from?.display_name ?? "current context",
      toName: b.display_name,
      accent: b.accent_colour || accentFor(b.business_key),
    });
  }

  useEffect(() => {
    if (!active && visible.length > 0) {
      setActive(user?.default_business ?? visible[0].business_key);
    }
  }, [active, visible, user?.default_business, setActive]);

  if (visible.length === 0) return null;

  if (variant === "compact") {
    return (
      <select
        value={active ?? ""}
        onChange={(e) => {
          const b = visible.find((x) => x.business_key === e.target.value);
          if (b) requestSwitch(b);
        }}
        className="bg-brand-charcoal text-brand-cream border border-brand-graphite rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide focus:border-brand-accent focus:outline-none"
      >
        {visible.map((b) => (
          <option key={b.business_key} value={b.business_key}>
            {b.display_name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div
      className={cn(
        "p-1 bg-brand-black/40 border border-brand-graphite rounded-xl",
        variant === "sidebar" ? "flex" : "inline-flex",
      )}
    >
      {visible.map((b) => {
        const accent = b.accent_colour || accentFor(b.business_key);
        const isActive = active === b.business_key;
        return (
          <button
            key={b.business_key}
            onClick={() => requestSwitch(b)}
            className={cn(
              "relative flex-1 px-3 py-2 rounded-lg text-[0.65rem] font-semibold uppercase tracking-widest transition-all",
              isActive
                ? "text-brand-black"
                : "text-brand-cloud hover:text-brand-cream",
            )}
            style={isActive ? { background: accent } : {}}
          >
            <span className="inline-flex items-center gap-1.5">
              {isActive && <Check className="w-3 h-3" />}
              {b.display_name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
