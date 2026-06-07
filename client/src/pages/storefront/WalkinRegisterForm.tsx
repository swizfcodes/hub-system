// ── WalkinRegisterForm.tsx ────────────────────────────────────────────────────
// Public walk-in registration page — /register/:business
// Permanent QR (not tied to any campaign). Collected details go straight
// into the CRM contacts table as a customer.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, ChevronDown } from "lucide-react";
import {
  submitWalkinRegistration,
  type WalkinRegistrationPayload,
} from "@services/contacts/contacts";
import { cn } from "@lib/cn";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type FormState = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address_city: string;
  address_state: string;
  wants_birthday: boolean;
  birthday_month: string;
  birthday_day: string;
};

const INITIAL: FormState = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  address_city: "",
  address_state: "",
  wants_birthday: false,
  birthday_month: "",
  birthday_day: "",
};

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base " +
  "text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 " +
  "focus:border-transparent placeholder:text-gray-400 transition";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function WalkinRegisterForm() {
  const { business } = useParams<{ business: string }>();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function set(key: keyof FormState, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!form.phone.trim()) { setError("Phone number is required."); return; }
    if (!form.email.trim())  { setError("Email address is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address."); return;
    }
    if (form.wants_birthday && (!form.birthday_month || !form.birthday_day)) {
      setError("Please select your birth month and day."); return;
    }

    const payload: WalkinRegistrationPayload = {
      first_name:    form.first_name.trim(),
      last_name:     form.last_name.trim(),
      phone:         form.phone.trim(),
      email:         form.email.trim(),
      address_city:  form.address_city.trim()  || undefined,
      address_state: form.address_state.trim() || undefined,
      wants_birthday: form.wants_birthday,
      birthday_month: form.wants_birthday ? parseInt(form.birthday_month) : undefined,
      birthday_day:   form.wants_birthday ? parseInt(form.birthday_day)   : undefined,
    };

    setSubmitting(true);
    try {
      await submitWalkinRegistration(business!, payload);
      setDone(true);
    } catch (err: any) {
      const data = err?.response?.data;
      setError(
        data?.message ||
        data?.errors?.[0]?.msg ||
        data?.error ||
        "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#f9f7f5] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-5">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" strokeWidth={1.5} />
          <h1 className="text-2xl font-semibold text-gray-900">Welcome!</h1>
          <p className="text-gray-500 leading-relaxed">
            You're now in our system. Check your inbox — we've sent you a
            welcome email with a link to our collection.
          </p>
          <p className="text-xs text-gray-400 pt-4">You can close this tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f7f5] flex flex-col">
      <div className="bg-white border-b border-gray-100 px-5 py-4 text-center">
        <p className="text-xs uppercase tracking-widest text-gray-400 font-medium">
          New client
        </p>
        <h1 className="text-lg font-semibold text-gray-900 mt-0.5">
          Register with us
        </h1>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 pt-6 pb-10">
        <div className="w-full max-w-sm">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" required>
                <input
                  type="text"
                  autoComplete="given-name"
                  autoFocus
                  value={form.first_name}
                  onChange={(e) => set("first_name", e.target.value)}
                  placeholder="Ada"
                  className={inputCls}
                />
              </Field>
              <Field label="Last name" required>
                <input
                  type="text"
                  autoComplete="family-name"
                  value={form.last_name}
                  onChange={(e) => set("last_name", e.target.value)}
                  placeholder="Obi"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Phone number" required>
              <input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="080 0000 0000"
                className={inputCls}
              />
            </Field>

            <Field label="Email address" required>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="ada@example.com"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <input
                  type="text"
                  value={form.address_city}
                  onChange={(e) => set("address_city", e.target.value)}
                  placeholder="Lagos"
                  className={inputCls}
                />
              </Field>
              <Field label="State">
                <input
                  type="text"
                  value={form.address_state}
                  onChange={(e) => set("address_state", e.target.value)}
                  placeholder="Lagos"
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Birthday opt-in */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div className="mt-0.5 flex-shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.wants_birthday}
                    onChange={(e) => set("wants_birthday", e.target.checked)}
                  />
                  <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center border-2 transition",
                    form.wants_birthday
                      ? "bg-gray-900 border-gray-900"
                      : "border-gray-300 bg-white",
                  )}>
                    {form.wants_birthday && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5l3.5 4L11 1" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 leading-snug">
                    Receive birthday wishes & exclusive discounts 🎂
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    We'll send you something special on your birthday.
                  </p>
                </div>
              </label>

              {form.wants_birthday && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="relative">
                    <select
                      value={form.birthday_month}
                      onChange={(e) => set("birthday_month", e.target.value)}
                      className={cn(inputCls, "appearance-none pr-8")}
                    >
                      <option value="">Month</option>
                      {MONTHS.map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      value={form.birthday_day}
                      onChange={(e) => set("birthday_day", e.target.value)}
                      className={cn(inputCls, "appearance-none pr-8")}
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "w-full rounded-xl bg-gray-900 text-white py-3.5 text-base font-semibold transition active:scale-[0.98]",
                submitting ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-800",
              )}
            >
              {submitting ? "Saving…" : "Register →"}
            </button>

            <p className="text-center text-xs text-gray-400 pb-2">
              Your details are kept private and never shared.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
