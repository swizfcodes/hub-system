// ── MarkFailedModal.tsx ───────────────────────────────────────────────────────

import {
  useForm as useFormMF,
  Controller as ControllerMF,
} from "react-hook-form";
import { zodResolver as zodMF } from "@hookform/resolvers/zod";
import {
  useMutation as useMutMF,
  useQueryClient as useQCMF,
} from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Modal as ModalMF } from "@components/ui/Modal";
import { Button as ButtonMF } from "@components/ui/Button";
import { Input as InputMF } from "@components/ui/Input";
import { markFailed, markReturned } from "@services/logistics";
import {
  markFailedSchema,
  markReturnedSchema,
  type MarkFailedValues,
  type MarkReturnedValues,
} from "@lib/schemas/logistics";
import { showToast as toast } from "@hooks/useToast";
import { errMsg as e } from "@services/api";

interface MarkFailedModalProps {
  open: boolean;
  onClose: () => void;
  deliveryId: string;
  mode: "failed" | "returned";
}

export function MarkFailedModal({
  open,
  onClose,
  deliveryId,
  mode,
}: MarkFailedModalProps) {
  const qc = useQCMF();

  const failForm = useFormMF<MarkFailedValues>({
    resolver: zodMF(markFailedSchema),
    defaultValues: { failure_reason: "" },
  });

  const returnForm = useFormMF<MarkReturnedValues>({
    resolver: zodMF(markReturnedSchema),
    defaultValues: { notes: "" },
  });

  const failMutation = useMutMF({
    mutationFn: (v: MarkFailedValues) => markFailed(deliveryId, v),
    onSuccess: () => {
      toast.success("Delivery marked as failed");
      qc.invalidateQueries({ queryKey: ["delivery", deliveryId] });
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      onClose();
    },
    onError: (err) => toast.error(e(err)),
  });

  const returnMutation = useMutMF({
    mutationFn: (v: MarkReturnedValues) => markReturned(deliveryId, v),
    onSuccess: () => {
      toast.success("Marked returned — stock restocked");
      qc.invalidateQueries({ queryKey: ["delivery", deliveryId] });
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      onClose();
    },
    onError: (err) => toast.error(e(err)),
  });

  if (mode === "returned") {
    return (
      <ModalMF
        open={open}
        onClose={onClose}
        title="Mark as Returned"
        size="sm"
        surface="light"
        footer={
          <div className="flex justify-end gap-3">
            <ButtonMF
              variant="ghost"
              onClick={onClose}
              disabled={returnMutation.isPending}
            >
              Cancel
            </ButtonMF>
            <ButtonMF
              onClick={returnForm.handleSubmit((v) => returnMutation.mutate(v))}
              loading={returnMutation.isPending}
            >
              Confirm Return + Restock
            </ButtonMF>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-on-light-muted">
            Marking as returned will automatically restock all items in this
            delivery.
          </p>
          <ControllerMF
            name="notes"
            control={returnForm.control}
            render={({ field }) => (
              <InputMF {...field} label="Notes (optional)" surface="light" />
            )}
          />
        </div>
      </ModalMF>
    );
  }

  return (
    <ModalMF
      open={open}
      onClose={onClose}
      title="Mark Delivery Failed"
      size="sm"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <ButtonMF
            variant="ghost"
            onClick={onClose}
            disabled={failMutation.isPending}
          >
            Cancel
          </ButtonMF>
          <ButtonMF
            variant="danger"
            onClick={failForm.handleSubmit((v) => failMutation.mutate(v))}
            loading={failMutation.isPending}
          >
            <AlertTriangle className="h-4 w-4" />
            Mark Failed
          </ButtonMF>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text-on-light-muted">
          The logistics manager will be notified. When the package is returned
          to the store, use "Mark Returned" to restock automatically.
        </p>
        <ControllerMF
          name="failure_reason"
          control={failForm.control}
          render={({ field, fieldState }) => (
            <InputMF
              {...field}
              label="Reason for failure *"
              placeholder="e.g. Customer not home, wrong address, refused delivery"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />
      </div>
    </ModalMF>
  );
}
