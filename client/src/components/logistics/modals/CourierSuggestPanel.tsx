// ── CourierSuggestPanel.tsx ────────────────────────────────────────────────────
/**
 * Shows courier suggestions for a delivery address, fetches live quotes,
 * and lets staff pick one. Always suggests — never auto-selects.
 */
import { useState, useEffect } from "react";
import { Zap, Truck, Globe, Info } from "lucide-react";
import { suggestCouriers } from "@services/logistics";
import {
  COURIER_META,
  ZONE_LABEL,
  detectZone,
} from "@lib/constants/logisticsConstants";
import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";
import type {
  DeliveryAddress,
  CourierSuggestion,
  Courier,
} from "@typedefs/logistics";

interface CourierSuggestPanelProps {
  address: DeliveryAddress | null;
  selected: Courier | null;
  onSelect: (courier: Courier, fee: number) => void;
  currency?: string;
}

const ZONE_ICON = {
  lagos: Zap,
  interstate: Truck,
  international: Globe,
};

export function CourierSuggestPanel({
  address,
  selected,
  onSelect,
  currency = "NGN",
}: CourierSuggestPanelProps) {
  const [suggestions, setSuggestions] = useState<CourierSuggestion[]>([]);
  const [zone, setZone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address?.city || !address?.state) {
      setSuggestions([]);
      setZone(null);
      return;
    }
    setLoading(true);
    const detectedZone = detectZone(address);
    setZone(detectedZone);
    suggestCouriers(address)
      .then((res) => {
        if (res) {
          setSuggestions(res.options);
          setZone(res.zone);
        }
      })
      .finally(() => setLoading(false));
  }, [address?.city, address?.state, address?.country]);

  if (!address?.state) return null;

  const ZoneIcon = ZONE_ICON[zone as keyof typeof ZONE_ICON] ?? Truck;

  return (
    <div className="space-y-3">
      {/* Zone indicator */}
      {zone && (
        <div className="flex items-center gap-2 text-xs text-orika-smoke">
          <ZoneIcon className="h-3.5 w-3.5" />
          <span>{ZONE_LABEL[zone as keyof typeof ZONE_LABEL] ?? zone}</span>
        </div>
      )}

      {/* Courier options */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-orika-graphite/30 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map((opt) => {
            const meta = COURIER_META[opt.courier];
            const isSelected = selected === opt.courier;

            return (
              <button
                key={opt.courier}
                type="button"
                onClick={() => onSelect(opt.courier, opt.fee ?? 0)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all",
                  isSelected
                    ? "border-orika-gold/60 bg-orika-gold/5"
                    : "border-white/10 bg-orika-charcoal hover:border-white/20",
                )}
              >
                {/* Courier colour chip */}
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: meta.color }}
                />

                {/* Courier info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-orika-cream">
                      {opt.label}
                    </span>
                    {opt.recommended && (
                      <span className="rounded-full bg-orika-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-orika-gold">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-orika-smoke">
                    Est. {opt.estimated_hours} hours
                  </p>
                </div>

                {/* Fee */}
                <div className="text-right shrink-0">
                  {opt.fee != null ? (
                    <p className="text-sm font-semibold text-orika-cream tabular-nums">
                      {fmtMoney(opt.fee, currency)}
                    </p>
                  ) : opt.fee_error ? (
                    <p className="text-xs text-orika-smoke">
                      Quote unavailable
                    </p>
                  ) : (
                    <p className="text-xs text-orika-smoke">Enter manually</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[0.65rem] text-orika-smoke/60">
        <Info className="h-3 w-3 shrink-0 mt-px" />
        Fees are estimates from the courier API. Final fee is confirmed at
        booking.
      </p>
    </div>
  );
}
