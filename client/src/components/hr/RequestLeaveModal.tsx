import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Select } from "@components/ui/Select";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { submitLeave, type LeaveType } from "@services/hr";

const LEAVE_OPTIONS = [
  { value: "annual", label: "Annual leave" },
  { value: "sick", label: "Sick leave" },
  { value: "maternity", label: "Maternity" },
  { value: "paternity", label: "Paternity" },
  { value: "compassionate", label: "Compassionate" },
  { value: "unpaid", label: "Unpaid leave" },
];

function inclusiveDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms >= 0 ? Math.floor(ms / 86400000) + 1 : 0;
}

export function RequestLeaveModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<LeaveType>("annual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const days = inclusiveDays(start, end);

  const mut = useMutation({
    mutationFn: () =>
      submitLeave({
        leave_type: type,
        start_date: start,
        end_date: end,
        days_requested: days || undefined,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      qc.invalidateQueries({ queryKey: ["leave"] });
      showToast.success("Leave request submitted");
      setStart("");
      setEnd("");
      setReason("");
      onClose();
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request leave"
      description={type === "unpaid" ? "Unpaid leave is deducted from your pay." : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!start || !end || days <= 0 || mut.isPending}
          >
            {mut.isPending ? "Submitting…" : `Submit${days ? ` · ${days} day${days > 1 ? "s" : ""}` : ""}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Leave type"
          options={LEAVE_OPTIONS}
          value={type}
          onChange={(e) => setType(e.target.value as LeaveType)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Input
            label="End date"
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <Textarea
          label="Reason (optional)"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="A short note for your manager…"
        />
      </div>
    </Modal>
  );
}
