import { Link } from "react-router-dom";
import { Pencil, Archive, Hash, MapPin, Mail, Globe } from "lucide-react";
import type { Business } from "@typedefs/settings";
import { Badge } from "@components/ui/Badge";
import { DropdownMenu } from "@components/ui/DropdownMenu";
import { cn } from "@lib/cn";
import { fmtPercent } from "@lib/format";

interface Props {
  business: Business;
  onArchive: (b: Business) => void;
}

export function BusinessCard({ business: b, onArchive }: Props) {
  return (
    <article className="group relative rounded-3xl border border-brand-graphite bg-brand-charcoal/70 overflow-hidden hover:border-brand-accent/40 hover:shadow-card-lg hover:-translate-y-1 transition-all">
      {/* Accent stripe */}
      <div
        className="absolute top-0 inset-x-0 h-1.5"
        style={{ background: b.accent_colour || "#C9A86C" }}
      />

      {/* Logo & branding row */}
      <div className="p-6 pb-4 flex items-start gap-4">
        <div className="shrink-0 w-16 h-16 rounded-2xl bg-brand-cream border border-brand-cloud/40 p-2 flex items-center justify-center overflow-hidden">
          {b.logo_path ? (
            <img
              src={b.logo_path}
              alt={`${b.display_name} logo`}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="font-display text-2xl text-brand-black/70">
              {b.display_name?.[0]}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-display text-2xl text-brand-cream leading-tight truncate">
              {b.display_name}
            </h3>
            {!b.is_active && (
              <Badge tone="danger" size="xs">
                Archived
              </Badge>
            )}
          </div>
          <p className="text-xs text-brand-smoke truncate">{b.legal_name}</p>
        </div>

        <DropdownMenu
          surface="dark"
          items={[
            {
              label: "Edit",
              icon: <Pencil className="w-3.5 h-3.5" />,
              onClick: () => {
                window.location.href = `/settings/business-setup/${b.business_key}`;
              },
            },
            {
              label: b.is_active ? "Archive business" : "Restore (re-activate)",
              icon: <Archive className="w-3.5 h-3.5" />,
              destructive: b.is_active,
              onClick: () => onArchive(b),
            },
          ]}
        />
      </div>

      {/* Meta strip */}
      <div className="px-6 pb-4 grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
        <Meta icon={<Hash className="w-3 h-3" />} text={b.business_key} mono />
        <Meta
          icon={<span className="font-mono">¤</span>}
          text={b.default_currency}
        />
        <Meta icon={<MapPin className="w-3 h-3" />} text={b.address || "—"} />
        <Meta icon={<Mail className="w-3 h-3" />} text={b.email || "—"} />
        {b.website && (
          <Meta
            icon={<Globe className="w-3 h-3" />}
            text={b.website.replace(/^https?:\/\//, "")}
            className="col-span-2"
          />
        )}
      </div>

      {/* Numbers strip */}
      <div className="px-6 py-4 border-t border-brand-graphite/70 bg-brand-black/30 grid grid-cols-3 gap-3">
        <Stat label="VAT" value={fmtPercent(b.vat_rate, 1)} />
        <Stat label="WHT" value={fmtPercent(b.wht_rate, 1)} />
        <Stat label="Fiscal" value={`Month ${b.fiscal_year_start}`} />
      </div>

      {/* CTA */}
      <Link
        to={`/settings/business-setup/${b.business_key}`}
        className="block px-6 py-3 border-t border-brand-graphite/70 text-xs uppercase tracking-widest font-semibold text-brand-accent hover:bg-brand-graphite/40 transition-colors text-center"
      >
        Open business
      </Link>
    </article>
  );
}

function Meta({
  icon,
  text,
  mono,
  className,
}: {
  icon: React.ReactNode;
  text: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-brand-cloud min-w-0",
        className,
      )}
    >
      <span className="text-brand-smoke shrink-0">{icon}</span>
      <span className={cn("truncate", mono && "font-mono")}>{text}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.55rem] tracking-widest uppercase text-brand-smoke">
        {label}
      </div>
      <div className="text-sm font-mono text-brand-cream mt-0.5">{value}</div>
    </div>
  );
}
