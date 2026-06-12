import { useState, useRef, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, UserPlus, X, User } from "lucide-react";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { Modal } from "@components/ui/Modal";
import {
  searchContacts,
  createContact,
  type Contact,
} from "@services/contacts";
import {
  quickCreateContactSchema,
  type QuickCreateContactValues,
} from "@lib/schemas/pos";
import { cn } from "@lib/cn";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

interface Props {
  value: Contact | null;
  onChange: (contact: Contact | null) => void;
  label?: string;
  required?: boolean;
  className?: string;
}

export function ContactSearchInput({
  value,
  onChange,
  label = "Customer",
  required = false,
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick-create form
  const form = useForm<QuickCreateContactValues>({
    resolver: zodResolver(quickCreateContactSchema),
    defaultValues: {
      display_name: "",
      primary_phone: "",
      whatsapp_number: "",
      email: "",
    },
  });

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const found = await searchContacts(query, 8);
      setResults(found);
      setLoading(false);
    }, 300);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current
          .closest(".contact-search-root")
          ?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(contact: Contact) {
    onChange(contact);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function clear() {
    onChange(null);
    setQuery("");
  }

  async function handleCreate(data: QuickCreateContactValues) {
    try {
      const contact = await createContact({
        display_name: data.display_name,
        primary_phone: data.primary_phone,
        whatsapp_number: data.whatsapp_number || undefined,
        email: data.email || undefined,
        contact_type: ["customer"],
        source: "walk_in",
      });
      select(contact);
      setShowCreate(false);
      form.reset();
      showToast.success(`Contact ${contact.display_name} created`);
    } catch (err) {
      showToast.error(errMsg(err));
    }
  }

  // Selected state
  if (value) {
    return (
      <div className={cn("contact-search-root", className)}>
        {label && (
          <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
            {label}
            {required && <span className="ml-0.5 text-red-400">*</span>}
          </label>
        )}
        <div className="flex items-center gap-3 rounded-lg border border-brand-accent/40 bg-brand-accent/5 px-3 py-2.5">
          <User className="h-4 w-4 shrink-0 text-brand-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-brand-cream">
              {value.display_name}
            </p>
            <p className="text-xs text-brand-smoke">{value.primary_phone}</p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-brand-smoke hover:text-brand-cream transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("contact-search-root relative", className)}>
      {label && (
        <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
          {label}
          {required && <span className="ml-0.5 text-red-400">*</span>}
        </label>
      )}

      <div
        className="relative"
        ref={inputRef as React.RefObject<HTMLDivElement>}
      >
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-smoke" />
        <input
          type="text"
          ref={inputRef}
          value={query}
          placeholder="Search by name, phone, or email..."
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-lg border border-white/10 bg-brand-graphite py-2 pl-8 pr-3 text-sm text-brand-cream placeholder-brand-smoke/50 focus:border-brand-accent/50 focus:outline-none"
        />
      </div>

      {/* Dropdown */}
      {open && (query.length >= 2 || results.length > 0) && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-brand-charcoal shadow-xl">
          {loading ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : results.length > 0 ? (
            <ul className="max-h-52 overflow-y-auto divide-y divide-white/5">
              {results.map((contact) => (
                <li key={contact.contact_id}>
                  <button
                    type="button"
                    onClick={() => select(contact)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-brand-graphite/40 transition-colors"
                  >
                    <User className="h-4 w-4 shrink-0 text-brand-smoke" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-brand-cream">
                        {contact.display_name}
                      </p>
                      <p className="text-xs text-brand-smoke">
                        {contact.primary_phone}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.length >= 2 ? (
            <p className="px-3 py-3 text-xs text-brand-smoke">
              No contacts found for "{query}"
            </p>
          ) : null}

          {/* Quick create option */}
          <div className="border-t border-white/5 p-2">
            <button
              type="button"
              onClick={() => {
                setShowCreate(true);
                setOpen(false);
                form.setValue("display_name", query);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-brand-accent hover:bg-brand-accent/5 transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add new contact{query ? ` "${query}"` : ""}
            </button>
          </div>
        </div>
      )}

      {/* Quick-create modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Contact"
        size="md"
        surface="light"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(handleCreate)}
              loading={form.formState.isSubmitting}
            >
              Create & Select
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Controller
            name="display_name"
            control={form.control}
            render={({ field, fieldState }) => (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Name *
                </label>
                <Input
                  {...field}
                  placeholder="Full name"
                  error={fieldState.error?.message}
                />
              </div>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="primary_phone"
              control={form.control}
              render={({ field, fieldState }) => (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                    Phone *
                  </label>
                  <Input
                    {...field}
                    type="tel"
                    placeholder="+234..."
                    error={fieldState.error?.message}
                  />
                </div>
              )}
            />
            <Controller
              name="whatsapp_number"
              control={form.control}
              render={({ field }) => (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                    WhatsApp
                  </label>
                  <Input {...field} type="tel" placeholder="+234..." />
                </div>
              )}
            />
          </div>
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Email
                </label>
                <Input
                  {...field}
                  type="email"
                  placeholder="customer@email.com"
                  error={fieldState.error?.message}
                />
              </div>
            )}
          />
          <p className="text-xs text-brand-smoke/60">
            Phone is required for WhatsApp receipts. Email is required for email
            receipts.
          </p>
        </div>
      </Modal>
    </div>
  );
}
