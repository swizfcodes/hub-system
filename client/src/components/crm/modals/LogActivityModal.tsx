import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Textarea } from "@components/ui/Textarea";
import { logActivitySchema, type LogActivityValues } from "@lib/schemas/deal";
import {
  CRM_ACTIVITY_TYPES,
  QUICK_TEMPLATE_ORDER,
  DEFAULT_SUMMARIES,
} from "@lib/constants/crmActivityTypes";
import { logActivity } from "@services/crm/activities";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { ActivityType } from "@typedefs/crm";
import { cn } from "@lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  dealId: string;
  defaultType?: ActivityType;
}

export function LogActivityModal({
  open,
  onClose,
  dealId,
  defaultType,
}: Props) {
  const qc = useQueryClient();
  const [type, setType] = useState<ActivityType>(defaultType ?? "call");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LogActivityValues>({
    resolver: zodResolver(logActivitySchema),
    defaultValues: {
      activity_type: defaultType ?? "call",
      summary: DEFAULT_SUMMARIES[defaultType ?? "call"] ?? "",
      direction: CRM_ACTIVITY_TYPES[defaultType ?? "call"].defaultDirection,
    },
  });
  const direction = watch("direction");

  useEffect(() => {
    if (!open) return;
    const initial = defaultType ?? "call";
    setType(initial);
    reset({
      activity_type: initial,
      summary: DEFAULT_SUMMARIES[initial] ?? "",
      direction: CRM_ACTIVITY_TYPES[initial].defaultDirection,
    });
  }, [open, defaultType, reset]);

  const mutation = useMutation({
    mutationFn: (v: LogActivityValues) => logActivity(dealId, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm", "deal", dealId] });
      qc.invalidateQueries({ queryKey: ["crm"] });
      showToast.success("Activity logged");
      reset();
      onClose();
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  const handleTypeChange = (t: ActivityType) => {
    setType(t);
    setValue("activity_type", t);
    setValue("summary", DEFAULT_SUMMARIES[t] ?? "");
    setValue("direction", CRM_ACTIVITY_TYPES[t].defaultDirection);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      surface="light"
      size="md"
      title="Log activity"
      description="A few seconds now saves you hours later."
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
            Log activity
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Type chips */}
        <div>
          <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted mb-2 ml-1">
            What happened?
          </div>
          <div className="grid grid-cols-5 gap-2">
            {QUICK_TEMPLATE_ORDER.map((t) => {
              const m = CRM_ACTIVITY_TYPES[t];
              const Icon = m.icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border transition-all",
                    active
                      ? "border-brand-black bg-brand-black text-brand-cream shadow-card"
                      : "bg-white border-brand-cloud/40 text-brand-black/70 hover:border-brand-black/40",
                  )}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: active ? m.color : undefined }}
                  />
                  <span className="text-[0.65rem] font-semibold">
                    {m.label}
                  </span>
                  {m.shortcut && (
                    <kbd className="text-[0.55rem] px-1 py-0.5 rounded bg-brand-cloud/40 text-brand-black/60">
                      {m.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Direction toggle (for types that have one) */}
        {CRM_ACTIVITY_TYPES[type].defaultDirection && (
          <div>
            <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted mb-2 ml-1">
              Direction
            </div>
            <div className="inline-flex p-0.5 rounded-lg bg-brand-cream/50 border border-brand-cloud/40">
              {(["outbound", "inbound"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setValue("direction", d)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    direction === d
                      ? "bg-white shadow-sm text-brand-black"
                      : "text-text-on-light-muted hover:text-brand-black",
                  )}
                >
                  {d === "inbound" ? (
                    <ArrowDownRight className="w-3 h-3" />
                  ) : (
                    <ArrowUpRight className="w-3 h-3" />
                  )}
                  {d === "inbound" ? "They reached out" : "We reached out"}
                </button>
              ))}
            </div>
          </div>
        )}

        <Textarea
          {...register("summary")}
          label="Summary"
          placeholder="What was discussed or decided?"
          rows={4}
          error={errors.summary?.message}
          autoFocus
        />
      </div>
    </Modal>
  );
}
