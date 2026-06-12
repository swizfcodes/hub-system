import { cn } from "@lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-brand-graphite/60",
        className,
      )}
    />
  );
}
