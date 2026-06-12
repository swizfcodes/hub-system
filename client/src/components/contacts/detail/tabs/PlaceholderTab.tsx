import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { EmptyState } from "@components/ui/EmptyState";

export function PlaceholderTab({
  title,
  description,
  linkTo,
  linkLabel,
}: {
  title: string;
  description: string;
  linkTo?: string;
  linkLabel?: string;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        linkTo && (
          <Link
            to={linkTo}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent hover:text-brand-cream transition-colors"
          >
            {linkLabel ?? "Open module"} <ArrowUpRight className="w-4 h-4" />
          </Link>
        )
      }
    />
  );
}
