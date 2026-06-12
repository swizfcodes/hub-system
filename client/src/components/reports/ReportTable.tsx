/**
 * ReportTable — universal table renderer.
 * Renders any { meta, columns, rows } report shape with proper
 * column-type formatting. Supports comparison delta columns.
 */
import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { formatCellValue } from "@lib/constants/reportsConstants";
import { cn } from "@lib/cn";
import type { ReportData, ReportColumn } from "@typedefs/reports";

interface ReportTableProps {
  report: ReportData;
  compareReport?: ReportData | null;
  maxRows?: number;
}

const NUMERIC_TYPES = ["int", "decimal", "currency", "percent"];

export function ReportTable({
  report,
  compareReport,
  maxRows = 500,
}: ReportTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { columns, rows, meta } = report;

  // Sort rows
  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const av = a[sortKey] as number | string;
        const bv = b[sortKey] as number | string;
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      })
    : rows;

  const visible = sorted.slice(0, maxRows);
  const truncated = rows.length > maxRows;

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-3">
      {/* Summary cards from meta */}
      {(meta.summary || meta.totals) && (
        <SummaryCards meta={meta} columns={columns} />
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-brand-charcoal">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    "px-4 py-3 text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke cursor-pointer select-none hover:text-brand-cream transition-colors",
                    NUMERIC_TYPES.includes(col.type)
                      ? "text-right"
                      : "text-left",
                  )}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">
                      {sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </th>
              ))}
              {compareReport && (
                <th className="px-4 py-3 text-right text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke/50">
                  Δ vs Compare
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-brand-smoke"
                >
                  No data in this range.
                </td>
              </tr>
            )}
            {visible.map((row, i) => {
              const compareRow = compareReport?.rows[i];
              // Find first numeric column for delta
              const numericCol = columns.find((c) =>
                NUMERIC_TYPES.includes(c.type),
              );
              let delta: number | null = null;
              if (compareRow && numericCol) {
                const cur = parseFloat(String(row[numericCol.key] || 0));
                const prev = parseFloat(
                  String(compareRow[numericCol.key] || 0),
                );
                delta = prev !== 0 ? ((cur - prev) / prev) * 100 : null;
              }

              return (
                <tr
                  key={i}
                  className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 tabular-nums",
                        NUMERIC_TYPES.includes(col.type)
                          ? "text-right font-medium text-brand-cream"
                          : "text-brand-cloud",
                      )}
                    >
                      {formatCellValue(row[col.key], col.type)}
                    </td>
                  ))}
                  {compareReport && (
                    <td className="px-4 py-3 text-right">
                      {delta !== null ? (
                        <DeltaBadge delta={delta} />
                      ) : (
                        <span className="text-brand-smoke/30">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {/* Totals row */}
          {meta.totals && (
            <tfoot>
              <tr className="border-t-2 border-white/10 bg-brand-graphite/20">
                {columns.map((col, i) => {
                  const total = meta.totals![col.key];
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 font-semibold tabular-nums",
                        NUMERIC_TYPES.includes(col.type)
                          ? "text-right text-brand-cream"
                          : "text-brand-smoke",
                      )}
                    >
                      {i === 0
                        ? "Totals"
                        : total != null
                          ? formatCellValue(total, col.type)
                          : ""}
                    </td>
                  );
                })}
                {compareReport && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {truncated && (
        <p className="text-xs text-center text-brand-smoke">
          Showing {maxRows.toLocaleString()} of {rows.length.toLocaleString()}{" "}
          rows — export to see all.
        </p>
      )}
    </div>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({
  meta,
  columns,
}: {
  meta: ReportData["meta"];
  columns: ReportColumn[];
}) {
  const data = meta.summary ?? meta.totals ?? {};
  const entries = Object.entries(data).filter(([, v]) => typeof v !== "object");

  if (!entries.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {entries.slice(0, 6).map(([key, value]) => {
        const col = columns.find((c) => c.key === key);
        const formatted = col
          ? formatCellValue(value, col.type)
          : typeof value === "number"
            ? value.toLocaleString()
            : String(value);

        const label = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

        return (
          <div
            key={key}
            className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3"
          >
            <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
              {label}
            </p>
            <p className="font-display text-xl font-light tabular-nums text-brand-cream">
              {formatted}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Delta badge ───────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number }) {
  const isPositive = delta > 0;
  const isZero = Math.abs(delta) < 0.01;

  if (isZero)
    return <Minus className="mx-auto h-3.5 w-3.5 text-brand-smoke/40" />;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
        isPositive ? "text-emerald-400" : "text-red-400",
      )}
    >
      {isPositive ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : (
        <ArrowDownRight className="h-3.5 w-3.5" />
      )}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}
