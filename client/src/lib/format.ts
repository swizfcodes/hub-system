import { format, formatDistanceToNow, parseISO } from "date-fns";

export function fmtDate(
  iso: string | Date | null | undefined,
  pattern = "d MMM yyyy",
): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseISO(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return format(d, pattern);
}

export function fmtDateTime(iso: string | Date | null | undefined): string {
  return fmtDate(iso, "d MMM yyyy, HH:mm");
}

export function fmtRelative(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseISO(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  CAD: "C$",
  GHS: "GH₵",
  ZAR: "R",
};

export function fmtMoney(
  amount: number | string | null | undefined,
  currency = "NGN",
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return "—";
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${num.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPercent(
  rate: number | string | null | undefined,
  decimals = 2,
): string {
  if (rate === null || rate === undefined || rate === "") return "—";
  const num = typeof rate === "string" ? parseFloat(rate) : rate;
  if (Number.isNaN(num)) return "—";
  return `${(num * 100).toFixed(decimals)}%`;
}

export function maskAccountNumber(num?: string | null): string {
  if (!num || num.length < 4) return "••••";
  return `••••${num.slice(-4)}`;
}

export function previewSeq(
  prefix: string,
  next: number,
  padding: number,
): string {
  return `${prefix}-${String(next).padStart(padding, "0")}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
