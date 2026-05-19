import { Briefcase, MapPin, Building2 } from 'lucide-react';
import { Card } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { RestrictedField } from '../shared/RestrictedField';
import { fmtDate, fmtMoney } from '@lib/format';
import type { StaffProfile } from '@typedefs/staff';

export function EmploymentTab({ staff }: { staff: StaffProfile }) {
  const yearsTenure = staff.start_date
    ? Math.floor((Date.now() - new Date(staff.start_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25) * 10) / 10
    : null;

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-bejewelled-rose/15 text-bejewelled-rose flex items-center justify-center">
            <Briefcase className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl text-orika-cream">{staff.job_title}</h3>
            <div className="text-xs text-orika-smoke mt-0.5">
              {staff.department && <span className="capitalize">{staff.department} · </span>}
              <span className="font-mono">{staff.employee_number}</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              <Badge tone="rose" size="xs">{staff.employment_type.replace('_', ' ')}</Badge>
              <Badge tone={staff.end_date ? 'neutral' : 'sage'} size="xs">
                {staff.end_date ? `Ended ${fmtDate(staff.end_date)}` : 'Active'}
              </Badge>
              <Badge tone="gold" size="xs"><Building2 className="w-3 h-3" /> {staff.business}</Badge>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Started" value={fmtDate(staff.start_date)} />
        <Field label="Tenure" value={yearsTenure ? `${yearsTenure} year${yearsTenure === 1 ? '' : 's'}` : '—'} />
        {staff.reports_to_name && <Field label="Reports to" value={staff.reports_to_name} />}
        {staff.end_date && <Field label="Last day" value={fmtDate(staff.end_date)} />}
      </div>

      <section>
        <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold mb-3">Compensation & ID</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <RestrictedField surface="dark" label="Base salary" value={
            staff.base_salary === null || staff.base_salary === undefined ? '****'
              : fmtMoney(staff.base_salary, 'NGN')
          } />
          <RestrictedField surface="dark" label="Bank account" value={staff.bank_account_number} />
          <RestrictedField surface="dark" label="Bank" value={staff.bank_name ?? null} />
          <RestrictedField surface="dark" label="NIN" value={staff.nin} />
          <RestrictedField surface="dark" label="BVN" value={staff.bvn} />
          <RestrictedField surface="dark" label="Pension PIN" value={staff.pension_pin} />
          <RestrictedField surface="dark" label="NHF" value={staff.nhf_number ?? null} />
          <RestrictedField surface="dark" label="Tax ID" value={staff.tax_id ?? null} />
        </div>
        <p className="mt-3 text-[0.7rem] text-orika-smoke flex items-center gap-1.5">
          <MapPin className="w-3 h-3" />
          Restricted fields are visible only to HR and the staff member themselves. Reads are audit-logged.
        </p>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border border-orika-graphite bg-orika-charcoal/40">
      <div className="text-[0.6rem] uppercase tracking-widest text-orika-smoke">{label}</div>
      <div className="text-sm font-medium text-orika-cream mt-0.5">{value}</div>
    </div>
  );
}
