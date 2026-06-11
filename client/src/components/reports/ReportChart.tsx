import type { ElementType } from "react";
/**
 * ReportChart — renders a recharts visualization from the universal report shape.
 * Chart type is determined from REPORT_CHART_CONFIG or auto-detected from column types.
 */
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  REPORT_CHART_CONFIG,
  CHART_COLORS,
  formatCellValue,
} from "@lib/constants/reportsConstants";
import type { ReportData } from "@typedefs/reports";

interface ReportChartProps {
  report: ReportData;
  familyKey: string;
  reportType: string;
}

export function ReportChart({
  report,
  familyKey,
  reportType,
}: ReportChartProps) {
  const configKey = `${familyKey}.${reportType}`;
  const config = REPORT_CHART_CONFIG[configKey];
  const { rows, columns } = report;

  if (!rows.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-white/5 bg-brand-charcoal">
        <p className="text-sm text-brand-smoke">No data to chart</p>
      </div>
    );
  }

  // Auto-detect if no config
  const chartType = config?.type ?? "bar";
  const xKey = config?.xKey ?? columns[0]?.key ?? "label";
  const yKeys =
    config?.yKeys ??
    columns
      .filter(
        (c) =>
          ["int", "decimal", "currency", "percent"].includes(c.type) &&
          c.key !== xKey,
      )
      .map((c) => c.key)
      .slice(0, 3);

  // Find column metadata for labels
  const getLabel = (key: string) =>
    columns.find((c) => c.key === key)?.label ?? key;
  const getType = (key: string) =>
    columns.find((c) => c.key === key)?.type ?? "int";

  const tooltipFormatter = (value: unknown, name: string) => [
    formatCellValue(value, getType(name)),
    getLabel(name),
  ];

  const xTickFormatter = (val: string) => {
    if (!val) return "";
    const s = String(val);
    // Truncate long names for bar charts
    return s.length > 15 ? s.slice(0, 14) + "…" : s;
  };

  const sharedProps = {
    data: rows,
    margin: { top: 10, right: 20, left: 10, bottom: 40 },
  };

  const yAxisFormatter = (v: number) => {
    const type = getType(yKeys[0]);
    if (type === "currency") return `₦${(v / 1000).toFixed(0)}k`;
    if (type === "percent") return `${v}%`;
    return v.toLocaleString();
  };

  if (chartType === "pie") {
    const pieData = rows.slice(0, 10).map((row) => ({
      name: String(row[xKey] ?? ""),
      value: parseFloat(String(row[yKeys[0]] ?? 0)),
    }));
    const total = pieData.reduce((s, d) => s + d.value, 0);

    return (
      <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-4">
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={110}
              label={({ name, value }) =>
                `${name}: ${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%`
              }
              labelLine={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => formatCellValue(v, getType(yKeys[0]))}
              contentStyle={{
                background: "#1C1C1C",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                color: "#F5F0E8",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#9E9891" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const ChartComponent = chartType === "area" ? AreaChart : BarChart;
  const SeriesComponent = (chartType === "area"
    ? Area
    : Bar) as unknown as ElementType;

  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-4">
      <ResponsiveContainer width="100%" height={320}>
        <ChartComponent {...sharedProps}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey={xKey}
            tickFormatter={xTickFormatter}
            tick={{ fontSize: 11, fill: "#9E9891" }}
            angle={rows.length > 8 ? -30 : 0}
            textAnchor={rows.length > 8 ? "end" : "middle"}
          />
          <YAxis
            tickFormatter={yAxisFormatter}
            tick={{ fontSize: 11, fill: "#9E9891" }}
          />
          <Tooltip
            formatter={tooltipFormatter}
            contentStyle={{
              background: "#1C1C1C",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              color: "#F5F0E8",
            }}
          />
          {yKeys.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 11, color: "#9E9891" }} />
          )}
          {yKeys.map((key, i) => (
            <SeriesComponent
              key={key}
              type="monotone"
              dataKey={key}
              name={key}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={chartType === "area" ? 0.15 : 0.9}
            />
          ))}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
