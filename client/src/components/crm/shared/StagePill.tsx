import { cn } from "@lib/cn";

interface Props {
  stageKey: string;
  label?: string;
  colour?: string;
  size?: "xs" | "sm";
  className?: string;
}

/**
 * On-brand stage indicator. Uses the stage's own colour from pipeline_stage_defs
 * as a left dot + the label text. Subtle background tint at low alpha.
 */
export function StagePill({
  stageKey,
  label,
  colour = "#94A3B8",
  size = "sm",
  className,
}: Props) {
  const text = label ?? stageKey.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium tracking-wide uppercase border",
        size === "xs"
          ? "px-2 py-0.5 text-[0.6rem]"
          : "px-2.5 py-1 text-[0.65rem]",
        className,
      )}
      style={{
        color: colour,
        borderColor: `${colour}55`,
        background: `${colour}14`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: colour }}
      />
      {text}
    </span>
  );
}
