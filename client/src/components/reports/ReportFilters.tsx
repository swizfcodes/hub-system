import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import {
  DATE_PRESETS,
  GROUP_BY_OPTIONS,
  COMPARE_OPTIONS,
  REPORT_FAMILIES,
  getPresetRange,
  getCompareRange,
} from "@lib/constants/reportsConstants";
import { cn } from "@lib/cn";
import type {
  ReportFilters as Filters,
  CompareMode,
  GroupBy,
} from "@typedefs/reports";
import type { ReportFamilyKey } from "@lib/constants/reportsConstants";

interface ReportFiltersProps {
  family: string;
  reportType: string;
  filters: Filters;
  onChange: (f: Filters) => void;
  onRun: () => void;
  isLoading: boolean;
}

export function ReportFilters({
  family,
  reportType,
  filters,
  onChange,
  onRun,
  isLoading,
}: ReportFiltersProps) {
  const [preset, setPreset] = useState("last_30");
  const [showCompare, setShowCompare] = useState(false);

  const familyDef = REPORT_FAMILIES[family as ReportFamilyKey];
  const reportDef = familyDef?.types.find((t) => t.key === reportType);
  const params: readonly string[] = reportDef?.params ?? [];

  const needsDates =
    params.includes("start_date") || params.includes("end_date");
  const needsGroupBy = params.includes("group_by");
  const needsAsOfDate = params.includes("as_of_date");

  function applyPreset(p: string) {
    setPreset(p);
    const range = getPresetRange(p);
    const update: Filters = { ...filters, ...range };
    if (filters.compareMode !== "none" && filters.compareMode !== "custom") {
      const cmp = getCompareRange(range, filters.compareMode);
      update.compareStart = cmp.startDate;
      update.compareEnd = cmp.endDate;
    }
    onChange(update);
  }

  function handleCompareMode(mode: string) {
    const cm = mode as CompareMode;
    if (cm === "none") {
      onChange({
        ...filters,
        compareMode: "none",
        compareStart: undefined,
        compareEnd: undefined,
      });
      setShowCompare(false);
    } else if (cm !== "custom") {
      const primary = {
        startDate: filters.startDate,
        endDate: filters.endDate,
      };
      const cmp = getCompareRange(primary, cm);
      onChange({
        ...filters,
        compareMode: cm,
        compareStart: cmp.startDate,
        compareEnd: cmp.endDate,
      });
      setShowCompare(true);
    } else {
      onChange({ ...filters, compareMode: "custom" });
      setShowCompare(true);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/5 bg-brand-charcoal p-4">
      <div className="flex flex-wrap items-start gap-4">
        {/* Date range */}
        {needsDates && (
          <div className="flex flex-wrap items-end gap-3">
            {/* Presets */}
            <div className="space-y-1">
              <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke">
                Quick range
              </p>
              <div className="flex gap-1 flex-wrap">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => applyPreset(p.value)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                      preset === p.value
                        ? "bg-brand-accent text-brand-black"
                        : "bg-brand-graphite/30 text-brand-smoke hover:text-brand-cream",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="From"
              type="date"
              surface="dark"
              value={filters.startDate}
              onChange={(e) =>
                onChange({ ...filters, startDate: e.target.value })
              }
            />
            <Input
              label="To"
              type="date"
              surface="dark"
              value={filters.endDate}
              onChange={(e) =>
                onChange({ ...filters, endDate: e.target.value })
              }
            />
          </div>
        )}

        {/* As-of date */}
        {needsAsOfDate && (
          <Input
            label="As of Date"
            type="date"
            surface="dark"
            value={filters.endDate}
            onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
          />
        )}

        {/* Group by */}
        {needsGroupBy && (
          <Select
            label="Group By"
            options={GROUP_BY_OPTIONS}
            surface="dark"
            value={filters.groupBy ?? "month"}
            onChange={(e) =>
              onChange({ ...filters, groupBy: e.target.value as GroupBy })
            }
          />
        )}

        {/* Comparison */}
        {needsDates && (
          <div className="space-y-1">
            <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke">
              Compare to
            </p>
            <Select
              options={COMPARE_OPTIONS}
              surface="dark"
              value={filters.compareMode}
              onChange={(e) => handleCompareMode(e.target.value)}
            />
          </div>
        )}

        {/* Run button */}
        <div className="mt-auto">
          <Button onClick={onRun} loading={isLoading}>
            <RefreshCw className="h-4 w-4" />
            Run Report
          </Button>
        </div>
      </div>

      {/* Custom comparison range */}
      {showCompare && filters.compareMode === "custom" && (
        <div className="flex gap-3 border-t border-white/5 pt-3">
          <span className="text-xs text-brand-smoke mt-2">Compare:</span>
          <Input
            label="From"
            type="date"
            surface="dark"
            value={filters.compareStart ?? ""}
            onChange={(e) =>
              onChange({ ...filters, compareStart: e.target.value })
            }
          />
          <Input
            label="To"
            type="date"
            surface="dark"
            value={filters.compareEnd ?? ""}
            onChange={(e) =>
              onChange({ ...filters, compareEnd: e.target.value })
            }
          />
        </div>
      )}

      {/* Comparison range display */}
      {showCompare &&
        filters.compareMode !== "custom" &&
        filters.compareStart && (
          <p className="text-xs text-brand-smoke border-t border-white/5 pt-2">
            Comparing to: {filters.compareStart} → {filters.compareEnd}
          </p>
        )}
    </div>
  );
}
