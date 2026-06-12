import React from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} />}
        <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-brand-cloud max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      )}
    </div>
  );
}
