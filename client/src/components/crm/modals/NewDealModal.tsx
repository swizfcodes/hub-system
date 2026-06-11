import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { NumberField } from "@components/ui/NumberField";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { dealCreateSchema, type DealCreateValues } from "@lib/schemas/deal";
import { createDeal } from "@services/crm/deals";
import { getPipeline } from "@services/crm/pipeline";
import { ContactSearchInput } from "@components/shared/ContactSearchInput";
import type { Contact } from "@typedefs/contacts";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultStage?: string;
  defaultContactId?: string;
  onCreated?: (dealId: string) => void;
}

export function NewDealModal({
  open,
  onClose,
  defaultStage,
  defaultContactId,
  onCreated,
}: Props) {
  const qc = useQueryClient();
  const { data: pipeline } = useQuery({
    queryKey: ["crm", "pipeline"],
    queryFn: () => getPipeline(),
  });
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DealCreateValues>({
    resolver: zodResolver(dealCreateSchema),
    defaultValues: {
      contact_id: defaultContactId ?? "",
      title: "",
      stage: defaultStage ?? "",
      expected_value: undefined,
      probability: 50,
      expected_close_date: "",
      source: "",
    },
  });

  // Set default stage to first non-terminal once pipeline loads
  useEffect(() => {
    if (!open || !pipeline) return;
    const first = pipeline.pipeline.find((s) => !s.is_terminal);
    if (defaultStage) reset((v) => ({ ...v, stage: defaultStage }));
    else if (first) reset((v) => ({ ...v, stage: first.stage_key }));
  }, [open, pipeline, defaultStage, reset]);

  const mutation = useMutation({
    mutationFn: (v: DealCreateValues) =>
      createDeal({
        ...v,
        expected_value: v.expected_value ?? undefined,
        expected_close_date: v.expected_close_date || undefined,
        source: v.source || undefined,
        assigned_to: v.assigned_to || undefined,
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["crm"] });
      showToast.success("Deal created", d.title);
      reset();
      setSelectedContact(null);
      onClose();
      onCreated?.(d.deal_id);
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      surface="light"
      size="md"
      title="New deal"
      footer={
        <>
          <Button
            variant="outline-light"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting || mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            Create deal
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <div>
          <ContactSearchInput
            value={selectedContact}
            onChange={(c) => {
              setSelectedContact(c);
              setValue("contact_id", c?.contact_id ?? "");
            }}
            label="Contact"
            required
          />
          {errors.contact_id && (
            <p className="mt-1 text-xs text-red-500">
              {errors.contact_id.message}
            </p>
          )}
        </div>
        <Input
          {...register("title")}
          label="Deal title"
          placeholder="Engagement ring · Adaeze"
          error={errors.title?.message}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Controller
            control={control}
            name="stage"
            render={({ field }) => (
              <Select
                {...field}
                label="Stage"
                options={(pipeline?.pipeline ?? []).map((s) => ({
                  value: s.stage_key,
                  label: s.stage_label,
                }))}
                error={errors.stage?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="expected_value"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                decimal
                label="Expected value (NGN)"
                placeholder="0.00"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Input
            {...register("expected_close_date")}
            type="date"
            label="Expected close"
          />
        </div>
        <Select
          {...register("source")}
          label="Source (optional)"
          options={[
            { value: "", label: "—" },
            { value: "walk_in", label: "Walk in" },
            { value: "referral", label: "Referral" },
            { value: "social_media", label: "Social media" },
            { value: "repeat", label: "Repeat client" },
            { value: "campaign", label: "Campaign" },
            { value: "website", label: "Website" },
            { value: "event", label: "Event" },
          ]}
        />
      </form>
    </Modal>
  );
}
