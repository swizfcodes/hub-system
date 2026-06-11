import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Cake,
  GraduationCap,
  Building2,
  Heart,
  Calendar,
  Trash2,
} from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import {
  listMilestones,
  addMilestone,
  deleteMilestone,
} from "@services/crm/concierge";
import {
  milestoneSchema,
  MILESTONE_TYPES,
  type MilestoneValues,
} from "@lib/schemas/concierge";
import { fmtDate } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { MilestoneType } from "@typedefs/crm";

const TYPE_META: Record<
  MilestoneType,
  {
    icon: typeof Cake;
    label: string;
    tone: "gold" | "rose" | "sage" | "neutral";
  }
> = {
  birthday: { icon: Cake, label: "Birthday", tone: "rose" },
  wedding_anniversary: {
    icon: Heart,
    label: "Wedding anniversary",
    tone: "rose",
  },
  business_anniversary: {
    icon: Building2,
    label: "Business anniversary",
    tone: "gold",
  },
  graduation: { icon: GraduationCap, label: "Graduation", tone: "sage" },
  other: { icon: Calendar, label: "Other", tone: "neutral" },
};

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  // Annualise — push to next occurrence in this/next year.
  target.setFullYear(today.getFullYear());
  if (target.getTime() < today.getTime())
    target.setFullYear(today.getFullYear() + 1);
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function MilestonesPanel({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "milestones", contactId],
    queryFn: () => listMilestones(contactId),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMilestone(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm", "milestones", contactId] });
      showToast.success("Removed");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" /> Important dates
        </h3>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setAdding(true)}
        >
          Add date
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Cake className="w-6 h-6" />}
          title="No dates captured"
          description={`Birthday · anniversary · graduation · whatever matters to ${contactName}. The Hub will auto-suggest reminders 14, 7, and 1 days before each.`}
          action={
            <Button
              variant="gold"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setAdding(true)}
            >
              Add a date
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((m) => {
            const meta = TYPE_META[m.milestone_type];
            const Icon = meta.icon;
            const days = daysUntil(m.milestone_date);
            const isUpcoming = days <= 30;
            return (
              <Card
                key={m.milestone_id}
                className="p-3.5 flex items-center gap-3"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    meta.tone === "gold"
                      ? "bg-brand-accent/15 text-brand-accent"
                      : meta.tone === "rose"
                        ? "bg-accent3/15 text-accent3"
                        : meta.tone === "sage"
                          ? "bg-accent2/15 text-accent2"
                          : "bg-brand-graphite text-brand-cloud"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-brand-cream">
                      {meta.label}
                    </span>
                    {isUpcoming && (
                      <Badge tone={days <= 7 ? "gold" : "neutral"} size="xs">
                        {days === 0
                          ? "Today"
                          : days === 1
                            ? "Tomorrow"
                            : `in ${days} days`}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[0.65rem] text-brand-smoke mt-0.5">
                    {fmtDate(m.milestone_date, "d MMMM")}
                  </div>
                  {m.notes && (
                    <p className="text-[0.65rem] text-brand-cloud mt-1 italic">
                      "{m.notes}"
                    </p>
                  )}
                </div>
                <button
                  onClick={() => remove.mutate(m.milestone_id)}
                  className="p-1.5 text-brand-smoke hover:text-state-danger"
                  aria-label="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <AddMilestoneModal
        open={adding}
        onClose={() => setAdding(false)}
        contactId={contactId}
      />
    </div>
  );
}

function AddMilestoneModal({
  open,
  onClose,
  contactId,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MilestoneValues>({
    resolver: zodResolver(milestoneSchema),
    defaultValues: {
      milestone_type: "birthday",
      milestone_date: "",
      notes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (v: MilestoneValues) =>
      addMilestone(contactId, { ...v, notes: v.notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm", "milestones", contactId] });
      showToast.success("Date added");
      reset();
      onClose();
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
      size="sm"
      title="Add important date"
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
            Save
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <Select
          {...register("milestone_type")}
          label="Type"
          options={MILESTONE_TYPES.map((t) => ({
            value: t,
            label: TYPE_META[t].label,
          }))}
        />
        <Input
          {...register("milestone_date")}
          type="date"
          label="Date"
          error={errors.milestone_date?.message}
        />
        <Textarea
          {...register("notes")}
          label="Notes (optional)"
          rows={2}
          placeholder="e.g. partner's name, kid's birthday..."
        />
      </form>
    </Modal>
  );
}
