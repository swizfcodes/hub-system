import { Hash, Calendar, Database } from "lucide-react";
import type { Business } from "@typedefs/settings";
import { fmtDateTime } from "@lib/format";
import { Badge } from "@components/ui/Badge";

export function AdvancedTab({ business }: { business: Business }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-2xl text-brand-black mb-1">
          Advanced
        </h3>
        <p className="text-sm text-text-on-light-muted">
          System-level information about this business. Most fields here are
          read-only.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Info
          icon={<Hash className="w-3.5 h-3.5" />}
          label="Business key"
          value={
            <code className="font-mono text-brand-black">
              {business.business_key}
            </code>
          }
          hint="Permanent — never changes."
        />
        <Info
          icon={<Database className="w-3.5 h-3.5" />}
          label="Postgres schema"
          value={
            <code className="font-mono text-brand-black">
              {business.business_key}
            </code>
          }
          hint="Same as the business key, by convention."
        />
        <Info
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Created"
          value={fmtDateTime(business.created_at)}
        />
        <Info
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Last updated"
          value={fmtDateTime(business.updated_at)}
        />
        <Info
          label="Status"
          value={
            business.is_active ? (
              <Badge tone="sage" dot>
                Active
              </Badge>
            ) : (
              <Badge tone="danger" dot>
                Archived
              </Badge>
            )
          }
        />
      </div>

      <div className="rounded-2xl border border-brand-cloud/40 bg-white/40 p-5 mt-8">
        <h4 className="font-display text-lg text-brand-black mb-2">
          Permissions & access
        </h4>
        <p className="text-sm text-text-on-light-muted mb-3">
          Manage who can access this business — and what they can do once inside
          — from the
          <span className="text-brand-black font-medium">
            {" "}
            Permissions &amp; Roles
          </span>{" "}
          sub-module.
        </p>
        <a
          href="/settings/permissions"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-brand-black hover:text-brand-accent transition-colors"
        >
          Open Permissions →
        </a>
      </div>
    </div>
  );
}

function Info({
  icon,
  label,
  value,
  hint,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-brand-cloud/40 bg-white/40">
      <div className="text-[0.6rem] uppercase tracking-widest text-text-on-light-muted flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-brand-black mt-1">{value}</div>
      {hint && (
        <div className="text-xs text-text-on-light-muted mt-1.5">{hint}</div>
      )}
    </div>
  );
}
