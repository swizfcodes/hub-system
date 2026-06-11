import { Link } from "react-router-dom";
import { Star, Phone, Mail, MessageCircle, Building2 } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import type { Supplier } from "@typedefs/purchasing";

const STARS = (n: number) => (
  <div className="inline-flex" aria-label={`${n}/5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={`w-3 h-3 ${i <= n ? "fill-brand-accent text-brand-accent" : "text-brand-graphite"}`}
      />
    ))}
  </div>
);

export function SupplierRow({ supplier }: { supplier: Supplier }) {
  return (
    <Link to={`/procurement/suppliers/${supplier.supplier_id}`}>
      <Card className="p-4 hover:border-brand-accent/40 transition-all cursor-pointer">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent2/15 text-accent2 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-brand-cream truncate">
                {supplier.display_name}
              </span>
              {!supplier.is_active && (
                <Badge tone="warn" size="xs">
                  Inactive
                </Badge>
              )}
              <Badge tone="gold" size="xs">
                {supplier.preferred_currency}
              </Badge>
              <span className="text-[0.6rem] text-brand-smoke font-mono">
                {supplier.supplier_code}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[0.65rem] text-brand-smoke">
              {supplier.primary_phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-2.5 h-2.5" />
                  {supplier.primary_phone}
                </span>
              )}
              {supplier.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-2.5 h-2.5" />
                  {supplier.email}
                </span>
              )}
              {supplier.portal_access_token && (
                <span className="inline-flex items-center gap-1 text-brand-accent">
                  <MessageCircle className="w-2.5 h-2.5" />
                  Portal active
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            {STARS(supplier.rating ?? 3)}
            <div className="text-[0.6rem] text-brand-smoke mt-1">
              Net {supplier.payment_terms_days}d
              {supplier.lead_time_days
                ? ` · ${supplier.lead_time_days}d lead`
                : ""}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
