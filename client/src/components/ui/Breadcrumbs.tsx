import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-[0.7rem] uppercase tracking-widest text-brand-smoke"
    >
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {c.to ? (
            <Link
              to={c.to}
              className="hover:text-brand-cream transition-colors"
            >
              {c.label}
            </Link>
          ) : (
            <span
              className={
                i === items.length - 1 ? "text-brand-accent" : "text-brand-smoke"
              }
            >
              {c.label}
            </span>
          )}
          {i < items.length - 1 && (
            <ChevronRight className="w-3 h-3 opacity-50" />
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
