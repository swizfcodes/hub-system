import { Rows3, LayoutGrid } from "lucide-react";
import { cn } from "@lib/cn";

export type DirectoryView = "rail" | "cards";

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: DirectoryView;
  onChange: (v: DirectoryView) => void;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-brand-charcoal border border-brand-graphite">
      <button
        onClick={() => onChange("rail")}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[0.65rem] font-semibold uppercase tracking-wide transition-all",
          value === "rail"
            ? "bg-brand-graphite text-brand-cream"
            : "text-brand-smoke hover:text-brand-cream",
        )}
        aria-label="Master-detail view"
        title="Master-detail"
      >
        <Rows3 className="w-3.5 h-3.5" /> List
      </button>
      <button
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[0.65rem] font-semibold uppercase tracking-wide transition-all",
          value === "cards"
            ? "bg-brand-graphite text-brand-cream"
            : "text-brand-smoke hover:text-brand-cream",
        )}
        aria-label="Card view"
        title="Cards"
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Cards
      </button>
    </div>
  );
}
