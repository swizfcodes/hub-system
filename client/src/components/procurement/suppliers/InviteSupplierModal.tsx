import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, MessageCircle, UserPlus } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { Textarea } from '@components/ui/Textarea';
import { supplierInviteSchema, type SupplierInviteValues } from '@lib/schemas/purchasing';
import { inviteOrCreateSupplier } from '@services/purchasing/suppliers';
import { listBusinesses } from '@services/settings/businesses';
import { CURRENCIES } from '@lib/constants/currencies';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';

export function InviteSupplierModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: businesses = [] } = useQuery({ queryKey: ['settings', 'businesses', 'active'], queryFn: () => listBusinesses(false) });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<SupplierInviteValues>({
    resolver: zodResolver(supplierInviteSchema),
    defaultValues: {
      display_name: '', company_name: '', email: '', primary_phone: '', whatsapp_number: '',
      payment_terms_days: 30, preferred_currency: 'USD', notes: '',
    },
  });

  // const [visibleTo, setVisibleTo] = [
  //   (watch as unknown as () => string[])(),  // satisfies TS via wrapper below
  // ] as const;
  // Note: visible_to is supplied directly in the mutation below; modal keeps it simple.

  const mutation = useMutation({
    mutationFn: (v: SupplierInviteValues) =>
      inviteOrCreateSupplier({
        display_name: v.display_name || v.company_name || v.email,
        company_name: v.company_name,
        email: v.email,
        primary_phone: v.primary_phone || undefined,
        whatsapp_number: v.whatsapp_number || undefined,
        visible_to: businesses.map((b) => b.business_key),  // visible to all by default
        payment_terms_days: v.payment_terms_days,
        preferred_currency: v.preferred_currency,
        notes: v.notes || undefined,
      }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['purchasing', 'suppliers'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      showToast.success(`Supplier added`, `${s.display_name} now in the Directory + Procurement.`);
      reset(); onClose();
    },
    onError: (e) => showToast.error('Could not save', errMsg(e)),
  });

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} surface="light" size="md"
      title="Invite or add supplier"
      description="Creates a Directory contact (type: supplier) + the procurement supplier record in one step."
      footer={<>
        <Button variant="outline-light" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button variant="primary" leftIcon={<UserPlus className="w-4 h-4" />} loading={isSubmitting || mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v))}>Add supplier</Button>
      </>}>
      <div className="space-y-4">
        <Input {...register('display_name')} label="Display name" placeholder="Goldrush Imports" />
        <Input {...register('company_name')}  label="Company name (optional)" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input {...register('email')}         type="email" label="Email" leftIcon={<Mail className="w-3.5 h-3.5" />} error={errors.email?.message} />
          <Input {...register('primary_phone')} label="Phone" leftIcon={<Phone className="w-3.5 h-3.5" />} error={errors.primary_phone?.message} />
          <Input {...register('whatsapp_number')} label="WhatsApp (optional)" leftIcon={<MessageCircle className="w-3.5 h-3.5" />} />
          <Select {...register('preferred_currency')} label="Preferred currency"
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol} ${c.code}` }))} />
          <Input {...register('payment_terms_days', { valueAsNumber: true })} type="number" label="Payment terms (days)" />
        </div>
        <Textarea {...register('notes')} label="Notes (optional)" rows={3} />
      </div>
    </Modal>
  );
}
