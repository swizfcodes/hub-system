import { useState } from "react";
import { Briefcase, MapPin, Building2, Pencil } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Button } from "@components/ui/Button";
import { RestrictedField } from "../shared/RestrictedField";
import { EditStaffModal } from "./EditStaffModal";
import { fmtDate, fmtMoney } from "@lib/format";
import type { StaffProfile } from "@typedefs/staff";

export function EmploymentTab({ staff }: { staff: StaffProfile }) {
  const [editing, setEditing] = useState(false);

  const yearsTenure = staff.start_date
    ? Math.floor(
        ((Date.now() - new Date(staff.start_date).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)) *
          10,
      ) / 10
    : null;

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-accent3/15 text-accent3 flex items-center justify-center">
            <Briefcase className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl text-brand-cream">
              {staff.job_title}
            </h3>
            <div className="text-xs text-brand-smoke mt-0.5">
              {staff.department && (
                <span className="capitalize">{staff.department} · </span>
              )}
              <span className="font-mono">{staff.employee_number}</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              <Badge tone="rose" size="xs">
                {staff.employment_type.replace("_", " ")}
              </Badge>
              <Badge tone={staff.end_date ? "neutral" : "sage"} size="xs">
                {staff.end_date ? `Ended ${fmtDate(staff.end_date)}` : "Active"}
              </Badge>
              <Badge tone="gold" size="xs">
                <Building2 className="w-3 h-3" /> {staff.business}
              </Badge>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Pencil className="w-3.5 h-3.5" />}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Started" value={fmtDate(staff.start_date)} />
        <Field
          label="Tenure"
          value={
            yearsTenure
              ? `${yearsTenure} year${yearsTenure === 1 ? "" : "s"}`
              : "—"
          }
        />
        {staff.reports_to_name && (
          <Field label="Reports to" value={staff.reports_to_name} />
        )}
        {staff.end_date && (
          <Field label="Last day" value={fmtDate(staff.end_date)} />
        )}
      </div>

      <section>
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3">
          Compensation & ID
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <RestrictedField
            surface="dark"
            label="Base salary"
            value={
              staff.base_salary === null || staff.base_salary === undefined
                ? "****"
                : fmtMoney(staff.base_salary, "NGN")
            }
          />
          <RestrictedField
            surface="dark"
            label="Bank account"
            value={staff.bank_account_number}
          />
          <RestrictedField
            surface="dark"
            label="Bank"
            value={staff.bank_name ?? null}
          />
          <RestrictedField surface="dark" label="NIN" value={staff.nin} />
          <RestrictedField surface="dark" label="BVN" value={staff.bvn} />
          <RestrictedField
            surface="dark"
            label="Pension PIN"
            value={staff.pension_pin}
          />
          <RestrictedField
            surface="dark"
            label="NHF"
            value={staff.nhf_number ?? null}
          />
          <RestrictedField
            surface="dark"
            label="Tax ID"
            value={staff.tax_id ?? null}
          />
        </div>
        <p className="mt-3 text-[0.7rem] text-brand-smoke flex items-center gap-1.5">
          <MapPin className="w-3 h-3" />
          Restricted fields are visible only to HR and the staff member
          themselves. Reads are audit-logged.
        </p>
      </section>

      <EditStaffModal
        staff={staff}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border border-brand-graphite bg-brand-charcoal/40">
      <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
        {label}
      </div>
      <div className="text-sm font-medium text-brand-cream mt-0.5">{value}</div>
    </div>
  );
}
