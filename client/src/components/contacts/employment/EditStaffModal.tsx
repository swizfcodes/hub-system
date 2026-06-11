import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import { Button } from "@components/ui/Button";
import { Save, X } from "lucide-react";
import { updateStaff } from "@services/contacts/staff";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { StaffProfile } from "@typedefs/staff";

const DEPARTMENT_OPTIONS = [
  { value: "management", label: "Management" },
  { value: "sales", label: "Sales" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "logistics", label: "Logistics" },
  { value: "marketing", label: "Marketing" },
  { value: "hr", label: "Human Resources" },
  { value: "it", label: "IT" },
  { value: "customer_service", label: "Customer Service" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
];

const GENDER_OPTIONS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not", label: "Prefer not to say" },
];

interface Props {
  staff: StaffProfile;
  open: boolean;
  onClose: () => void;
}

export function EditStaffModal({ staff, open, onClose }: Props) {
  const qc = useQueryClient();

  // ── Personal (contact fields) ──────────────────────────────
  const [firstName, setFirstName] = useState(staff.first_name || "");
  const [lastName, setLastName] = useState(staff.last_name || "");
  const [primaryPhone, setPrimaryPhone] = useState(staff.primary_phone || "");
  const [whatsappNumber, setWhatsappNumber] = useState(staff.whatsapp_number || "");
  const [email, setEmail] = useState(staff.email || "");
  const [gender, setGender] = useState(staff.gender || "");
  const [dateOfBirth, setDateOfBirth] = useState(
    staff.date_of_birth ? staff.date_of_birth.slice(0, 10) : "",
  );

  // ── Employment (staff profile fields) ──────────────────────
  const [jobTitle, setJobTitle] = useState(staff.job_title || "");
  const [department, setDepartment] = useState(staff.department || "");
  const [employmentType, setEmploymentType] = useState(staff.employment_type || "full_time");
  const [startDate, setStartDate] = useState(
    staff.start_date ? staff.start_date.slice(0, 10) : "",
  );
  const [reportsTo, setReportsTo] = useState(staff.reports_to || "");

  // ── Compensation ───────────────────────────────────────────
  const [baseSalary, setBaseSalary] = useState(
    staff.base_salary != null ? String(staff.base_salary) : "",
  );

  // ── Bank details ───────────────────────────────────────────
  const [bankName, setBankName] = useState(unmasked(staff.bank_name) || "");
  const [bankAccountNumber, setBankAccountNumber] = useState(unmasked(staff.bank_account_number) || "");
  const [bankSortCode, setBankSortCode] = useState(unmasked(staff.bank_sort_code) || "");

  // ── Identity & statutory ───────────────────────────────────
  const [nin, setNin] = useState(unmasked(staff.nin) || "");
  const [bvn, setBvn] = useState(unmasked(staff.bvn) || "");
  const [pensionPin, setPensionPin] = useState(unmasked(staff.pension_pin) || "");
  const [nhfNumber, setNhfNumber] = useState(unmasked(staff.nhf_number) || "");
  const [taxId, setTaxId] = useState(unmasked(staff.tax_id) || "");

  // ── Reports-to dropdown data ───────────────────────────────
  const { data: staffList } = useQuery({
    queryKey: ["staff", "all-200"],
    queryFn: () =>
      import("@services/contacts/staff").then((m) => m.listStaff({ limit: 200 })),
    staleTime: 60_000,
  });
  const managerOptions = (staffList?.data ?? [])
    .filter((s) => s.profile_id !== staff.profile_id)
    .map((s) => ({ value: s.profile_id, label: `${s.display_name} — ${s.job_title}` }));

  const mutation = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = {};

      // Contact fields
      if (firstName !== (staff.first_name || "")) patch.first_name = firstName;
      if (lastName !== (staff.last_name || "")) patch.last_name = lastName;
      if (primaryPhone !== (staff.primary_phone || "")) patch.primary_phone = primaryPhone;
      if (whatsappNumber !== (staff.whatsapp_number || "")) patch.whatsapp_number = whatsappNumber;
      if (email !== (staff.email || "")) patch.email = email;
      if (gender !== (staff.gender || "")) patch.gender = gender || null;
      if (dateOfBirth !== (staff.date_of_birth?.slice(0, 10) || "")) patch.date_of_birth = dateOfBirth || null;

      // Staff profile fields
      if (jobTitle !== staff.job_title) patch.job_title = jobTitle;
      if (department !== (staff.department || "")) patch.department = department;
      if (employmentType !== staff.employment_type) patch.employment_type = employmentType;
      if (startDate !== staff.start_date?.slice(0, 10)) patch.start_date = startDate;
      if (reportsTo !== (staff.reports_to || "")) patch.reports_to = reportsTo || null;
      if (baseSalary && baseSalary !== String(staff.base_salary ?? "")) patch.base_salary = parseFloat(baseSalary);
      if (bankName && bankName !== unmasked(staff.bank_name)) patch.bank_name = bankName;
      if (bankAccountNumber && bankAccountNumber !== unmasked(staff.bank_account_number)) patch.bank_account_number = bankAccountNumber;
      if (bankSortCode !== unmasked(staff.bank_sort_code)) patch.bank_sort_code = bankSortCode || null;
      if (nin && nin !== unmasked(staff.nin)) patch.nin = nin;
      if (bvn && bvn !== unmasked(staff.bvn)) patch.bvn = bvn;
      if (pensionPin && pensionPin !== unmasked(staff.pension_pin)) patch.pension_pin = pensionPin;
      if (nhfNumber !== unmasked(staff.nhf_number)) patch.nhf_number = nhfNumber || null;
      if (taxId !== unmasked(staff.tax_id)) patch.tax_id = taxId || null;

      if (!Object.keys(patch).length) return Promise.resolve(staff);
      return updateStaff(staff.profile_id, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      showToast.success("Staff profile updated");
      onClose();
    },
    onError: (e) => showToast.error("Update failed", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      surface="light"
      size="lg"
      title="Edit staff profile"
      description={`${staff.display_name} · ${staff.employee_number}`}
      footer={
        <>
          <Button variant="outline-light" onClick={onClose} leftIcon={<X className="w-3.5 h-3.5" />}>
            Cancel
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()} leftIcon={<Save className="w-3.5 h-3.5" />}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
        {/* Personal */}
        <Section title="Personal information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            <Input label="Phone" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} placeholder="+234..." />
            <Input label="WhatsApp" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+234..." />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="sm:col-span-2" />
            <Select label="Gender" value={gender} onChange={(e) => setGender(e.target.value)} options={GENDER_OPTIONS} placeholder="Select" />
            <Input label="Date of birth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
        </Section>

        {/* Employment */}
        <Section title="Employment">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            <Select label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} options={DEPARTMENT_OPTIONS} placeholder="Select" />
            <Select label="Employment type" value={employmentType} onChange={(e) => setEmploymentType(e.target.value as "full_time" | "part_time" | "contract")} options={EMPLOYMENT_TYPE_OPTIONS} />
            <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Select
              label="Reports to"
              value={reportsTo}
              onChange={(e) => setReportsTo(e.target.value)}
              options={managerOptions}
              placeholder="No manager"
              className="sm:col-span-2"
            />
          </div>
          <div className="mt-3 p-3 rounded-lg bg-white/30 border border-brand-cloud/30">
            <div className="text-[0.6rem] uppercase tracking-widest text-text-on-light-muted">Employee code</div>
            <div className="text-sm font-mono font-medium text-brand-black/70 mt-0.5">{staff.employee_number}</div>
            <div className="text-[0.6rem] text-text-on-light-muted mt-0.5">System-generated · cannot be changed</div>
          </div>
        </Section>

        {/* Compensation */}
        <Section title="Compensation">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              decimal
              label="Base salary (₦)"
              placeholder="0.00"
              value={baseSalary === "" ? undefined : Number(baseSalary)}
              onValueChange={(v) =>
                setBaseSalary(v === undefined ? "" : String(v))
              }
              hint="Changing salary creates a contract amendment record"
            />
          </div>
        </Section>

        {/* Bank details */}
        <Section title="Bank details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. First Bank" />
            <Input label="Account number" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="10-digit account number" />
            <Input label="Sort code" value={bankSortCode} onChange={(e) => setBankSortCode(e.target.value)} placeholder="Optional" />
          </div>
        </Section>

        {/* Identity & statutory */}
        <Section title="Identity & statutory">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="NIN" value={nin} onChange={(e) => setNin(e.target.value)} placeholder="National Identification Number" />
            <Input label="BVN" value={bvn} onChange={(e) => setBvn(e.target.value)} placeholder="Bank Verification Number" />
            <Input label="Pension PIN" value={pensionPin} onChange={(e) => setPensionPin(e.target.value)} placeholder="PenCom PIN" />
            <Input label="NHF number" value={nhfNumber} onChange={(e) => setNhfNumber(e.target.value)} placeholder="National Housing Fund" />
            <Input label="Tax ID" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="FIRS TIN" />
          </div>
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[0.65rem] tracking-widest uppercase text-text-on-light-muted mb-3">{title}</h4>
      {children}
    </div>
  );
}

function unmasked(val: string | null | undefined): string {
  if (!val) return "";
  if (val.startsWith("****")) return "";
  return val;
}
