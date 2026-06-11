import { Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Checkbox } from "@components/ui/Checkbox";
import { Button } from "@components/ui/Button";
import { useBusinessStore } from "@stores/useBusinessStore";
import type { PriorityLevel, ContactSource } from "@typedefs/contacts";
import { PRIORITY_META } from "@lib/constants/contactTypes";
import { cn } from "@lib/cn";

export interface DirectoryFilterValues {
  search: string;
  priority?: PriorityLevel | "";
  source?: ContactSource | "";
  business?: string; // single-business filter (defaults to active)
  showAllBusinesses?: boolean;
}

interface Props {
  value: DirectoryFilterValues;
  onChange: (v: DirectoryFilterValues) => void;
}

export function DirectoryFilters({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const active = useBusinessStore((s) => s.active);

  const hasAdvanced = !!(
    value.priority ||
    value.source ||
    value.showAllBusinesses
  );

  const update = (patch: Partial<DirectoryFilterValues>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Search by name, phone, email…"
            value={value.search}
            onChange={(e) => update({ search: e.target.value })}
            leftIcon={<Search className="w-4 h-4" />}
            rightSlot={
              value.search ? (
                <button
                  onClick={() => update({ search: "" })}
                  className="text-brand-smoke hover:text-brand-cream"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : undefined
            }
            surface="dark"
          />
        </div>
        <Button
          variant={hasAdvanced ? "gold" : "secondary"}
          size="md"
          leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
          onClick={() => setExpanded((v) => !v)}
        >
          Filters{" "}
          {hasAdvanced && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-black/20 text-[0.55rem]">
              ●
            </span>
          )}
        </Button>
      </div>

      <div
        className={cn(
          "overflow-hidden transition-all",
          expanded ? "max-h-96" : "max-h-0",
        )}
      >
        <div className="pt-2 grid gap-3 sm:grid-cols-3 animate-slide-down">
          <Select
            surface="dark"
            label="Priority"
            value={value.priority || ""}
            onChange={(e) =>
              update({ priority: (e.target.value || "") as PriorityLevel | "" })
            }
            options={[
              { value: "", label: "Any priority" },
              ...Object.entries(PRIORITY_META).map(([k, m]) => ({
                value: k,
                label: m.label,
              })),
            ]}
          />
          <Select
            surface="dark"
            label="Source"
            value={value.source || ""}
            onChange={(e) =>
              update({ source: (e.target.value || "") as ContactSource | "" })
            }
            options={[
              { value: "", label: "Any source" },
              { value: "walk_in", label: "Walk-in" },
              { value: "social_media", label: "Social Media" },
              { value: "referral", label: "Referral" },
              { value: "website", label: "Website" },
              { value: "event", label: "Event" },
            ]}
          />
          <div className="flex items-end pb-2">
            <Checkbox
              surface="dark"
              checked={!!value.showAllBusinesses}
              onChange={(v) => update({ showAllBusinesses: v })}
              label={`Show across all businesses (currently: ${active ?? "—"})`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
