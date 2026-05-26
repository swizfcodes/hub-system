// ── CreateDeliveryModal.tsx ───────────────────────────────────────────────────

import { useState as useStateCD } from 'react';
import { useForm as useFormCD, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { CourierSuggestPanel } from '@components/logistics/modals/CourierSuggestPanel';
import { createDelivery } from '@services/logistics';
import { createDeliverySchema, type CreateDeliveryValues } from '@lib/schemas/logistics';
import { FEE_BEARER_OPTIONS } from '@lib/constants/logisticsConstants';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import type { Courier, DeliveryAddress } from '@typedefs/logistics';
import type { Contact } from '@typedefs/contacts';

interface CreateDeliveryModalProps {
  open:          boolean;
  onClose:       () => void;
  onCreated:     (deliveryId: string) => void;
  // Pre-fill from a Sales order or POS transaction
  prefill?: {
    reference_type: 'sales_order' | 'pos_transaction';
    reference_id:   string;
    contact:        Contact;
    address?:       Partial<DeliveryAddress>;
  };
  currency?: string;
}

export function CreateDeliveryModal({
  open, onClose, onCreated, prefill, currency = 'NGN',
}: CreateDeliveryModalProps) {
  const qc = useQueryClient();
  const [selectedFee, setSelectedFee] = useStateCD(0);

  const form = useFormCD<CreateDeliveryValues>({
    resolver: zodResolver(createDeliverySchema),
    defaultValues: {
      reference_type:   prefill?.reference_type ?? 'sales_order',
      reference_id:     prefill?.reference_id ?? '',
      contact_id:       prefill?.contact?.contact_id ?? '',
      delivery_address: {
        line1:          prefill?.address?.line1 ?? '',
        area:           prefill?.address?.area ?? '',
        city:           prefill?.address?.city ?? 'Lagos',
        state:          prefill?.address?.state ?? 'Lagos',
        country:        'Nigeria',
        landmark:       prefill?.address?.landmark ?? '',
        recipient_name: prefill?.contact?.display_name ?? '',
        phone:          prefill?.contact?.primary_phone ?? '',
      },
      courier:      'relay',
      delivery_fee: 0,
      fee_borne_by: 'customer',
    },
  });

  const watchedAddress = form.watch('delivery_address');

  const mutation = useMutation({
    mutationFn: createDelivery,
    onSuccess: (delivery) => {
      showToast.success(`Delivery ${delivery.delivery_number} created`);
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      onCreated(delivery.delivery_id);
      form.reset();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function handleCourierSelect(courier: Courier, fee: number) {
    form.setValue('courier', courier);
    form.setValue('delivery_fee', fee);
    selectedFee !== fee &&
    setSelectedFee(fee);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Delivery"
      size="lg"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
          >
            Create Delivery
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left — delivery address */}
        <div className="space-y-4">
          <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-text-on-light-muted">
            Delivery Address
          </p>

          <Controller
            name="delivery_address.recipient_name"
            control={form.control}
            render={({ field }) => (
              <Input {...field} label="Recipient Name" surface="light" />
            )}
          />
          <Controller
            name="delivery_address.phone"
            control={form.control}
            render={({ field }) => (
              <Input {...field} label="Recipient Phone" type="tel" surface="light" />
            )}
          />
          <Controller
            name="delivery_address.line1"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Street Address *"
                placeholder="14 Admiralty Way, Lekki Phase 1"
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="delivery_address.area"
              control={form.control}
              render={({ field }) => (
                <Input {...field} label="Area / Estate" surface="light" />
              )}
            />
            <Controller
              name="delivery_address.landmark"
              control={form.control}
              render={({ field }) => (
                <Input {...field} label="Landmark" placeholder="Near..." surface="light" />
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="delivery_address.city"
              control={form.control}
              render={({ field, fieldState }) => (
                <Input
                  {...field}
                  label="City *"
                  surface="light"
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="delivery_address.state"
              control={form.control}
              render={({ field, fieldState }) => (
                <Input
                  {...field}
                  label="State *"
                  surface="light"
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
          <Controller
            name="delivery_address.country"
            control={form.control}
            render={({ field }) => (
              <Input {...field} label="Country" surface="light" />
            )}
          />
        </div>

        {/* Right — courier selection */}
        <div className="space-y-4">
          <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-text-on-light-muted">
            Courier
          </p>

          <CourierSuggestPanel
            address={watchedAddress as DeliveryAddress}
            selected={form.watch('courier')}
            onSelect={handleCourierSelect}
            currency={currency}
          />

          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="delivery_fee"
              control={form.control}
              render={({ field }) => (
                <Input
                  {...field}
                  label="Delivery Fee (₦)"
                  type="number"
                  step="0.01"
                  min={0}
                  surface="light"
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              )}
            />
            <Controller
              name="fee_borne_by"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Fee paid by"
                  options={FEE_BEARER_OPTIONS}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  surface="light"
                />
              )}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

