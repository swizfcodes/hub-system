import React from "react";
import { Check } from "lucide-react";
import { cn } from "@lib/cn";

export interface WizardStep {
  key: string;
  label: string;
  description?: string;
}

interface Props {
  steps: WizardStep[];
  currentIndex: number;
  onStepClick?: (i: number) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function WizardShell({
  steps,
  currentIndex,
  onStepClick,
  children,
  footer,
}: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 lg:gap-10">
      {/* Stepper rail */}
      <aside className="lg:sticky lg:top-24 self-start">
        {/* Vertical on desktop, horizontal scroll on mobile */}
        <ol className="lg:space-y-2 flex lg:flex-col overflow-x-auto hide-scrollbar gap-2 lg:gap-0">
          {steps.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            const clickable = i <= currentIndex && onStepClick;
            return (
              <li key={step.key} className="flex-shrink-0 lg:w-full">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onStepClick(i)}
                  className={cn(
                    "group w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all",
                    active
                      ? "bg-brand-accent/10 border border-brand-accent/30"
                      : "border border-transparent",
                    !active && done && "hover:bg-brand-charcoal/60",
                    !clickable && "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                      done
                        ? "bg-accent2/20 text-accent2"
                        : active
                          ? "bg-brand-accent text-brand-black shadow-glow-sm"
                          : "bg-brand-graphite text-brand-smoke",
                    )}
                  >
                    {done ? <Check className="w-4 h-4" /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "text-sm font-medium truncate",
                        active
                          ? "text-brand-cream"
                          : done
                            ? "text-brand-cloud"
                            : "text-brand-smoke",
                      )}
                    >
                      {step.label}
                    </div>
                    {step.description && (
                      <div className="text-[0.65rem] text-brand-smoke truncate hidden lg:block">
                        {step.description}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Body */}
      <section className="min-w-0">
        <div className="bg-surface-light surface-light rounded-3xl p-6 sm:p-10 border border-brand-cloud/30 shadow-lift">
          <div className="animate-slide-up">{children}</div>
        </div>
        {footer && (
          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}
