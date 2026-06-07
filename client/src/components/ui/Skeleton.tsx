import { cn } from "@lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-orika-graphite/60",
        className,
      )}
    />
  );
}
