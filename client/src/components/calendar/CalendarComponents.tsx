/**
 * CalendarComponents.tsx
 * Exports: EventTypeChip, EventFormModal, ClashWarningModal, EventDetailPanel
 */
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, MapPin, Link2, Lock } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Badge } from "@components/ui/Badge";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  listParticipants,
} from "@services/calendar";
import {
  createEventSchema,
  type CreateEventValues,
} from "@lib/schemas/scheduling";
import {
  EVENT_TYPE_META,
  EVENT_TYPE_OPTIONS,
  fmtEventRange,
  REF_TYPE_LABEL,
} from "@lib/constants/schedulingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import type { CalendarEvent, ClashInfo } from "@typedefs/scheduling";

// ── EventTypeChip ─────────────────────────────────────────────────────────────

export function EventTypeChip({
  type,
  size = "sm",
}: {
  type: string;
  size?: "xs" | "sm";
}) {
  const meta =
    EVENT_TYPE_META[type as keyof typeof EVENT_TYPE_META] ??
    EVENT_TYPE_META.other;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 font-semibold uppercase tracking-wide border",
        size === "xs" ? "py-0.5 text-[0.6rem]" : "py-1 text-[0.65rem]",
      )}
      style={{
        color: meta.color,
        borderColor: `${meta.color}40`,
        backgroundColor: meta.bg,
      }}
    >
      {meta.label}
    </span>
  );
}

// ── EventPill (for calendar grid) ─────────────────────────────────────────────

export function EventPill({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (e: CalendarEvent) => void;
}) {
  const meta = EVENT_TYPE_META[event.event_type] ?? EVENT_TYPE_META.other;
  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="w-full truncate rounded px-1.5 py-0.5 text-left text-[0.65rem] font-medium leading-tight"
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        borderLeft: `2px solid ${meta.color}`,
      }}
    >
      {event.is_private ? "🔒 Private" : event.title}
    </button>
  );
}

// ── ClashWarningModal ─────────────────────────────────────────────────────────

interface ClashWarningModalProps {
  open: boolean;
  clashes: ClashInfo[];
  onForce: () => void;
  onCancel: () => void;
}

export function ClashWarningModal({
  open,
  clashes,
  onForce,
  onCancel,
}: ClashWarningModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Booking Clash Detected"
      size="sm"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onForce}>
            <AlertTriangle className="h-4 w-4" />
            Override & Book Anyway
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text-on-light-muted">
          This time slot conflicts with {clashes.length} existing event
          {clashes.length > 1 ? "s" : ""} at this location:
        </p>
        {clashes.map((c) => (
          <div
            key={c.event_id}
            className="rounded-xl border border-state-danger/20 bg-state-danger/5 px-4 py-3"
          >
            <p className="font-medium text-brand-black text-sm">{c.title}</p>
            <p className="text-xs text-text-on-light-muted">
              {fmtDate(c.start_at)} ·{" "}
              {new Date(c.start_at).toLocaleTimeString("en-NG", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              –{" "}
              {new Date(c.end_at).toLocaleTimeString("en-NG", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── EventFormModal ────────────────────────────────────────────────────────────

interface EventFormModalProps {
  open: boolean;
  onClose: () => void;
  existing?: CalendarEvent | null;
  defaultStart?: string;
}

export function EventFormModal({
  open,
  onClose,
  existing,
  defaultStart,
}: EventFormModalProps) {
  const qc = useQueryClient();
  const { active: business } = useActiveBusiness();
  const [clashes, setClashes] = useState<ClashInfo[]>([]);
  const [showClash, setShowClash] = useState(false);
  const [pendingData, setPendingData] = useState<any>(null);
  const isEdit = !!existing;

  function toLocalInput(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const form = useForm<CreateEventValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      title: existing?.title ?? "",
      event_type: (existing?.event_type ??
        "meeting") as CreateEventValues["event_type"],
      start_at: toLocalInput(existing?.start_at ?? defaultStart),
      end_at: toLocalInput(existing?.end_at),
      all_day: existing?.all_day ?? false,
      location: existing?.location ?? "",
      description: existing?.description ?? "",
      is_private: existing?.is_private ?? false,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: CreateEventValues & { force?: boolean }) =>
      isEdit
        ? updateEvent(existing!.event_id, data)
        : createEvent({ ...data, business: business! }),
    onSuccess: () => {
      showToast.success(isEdit ? "Event updated" : "Event created");
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      form.reset();
      onClose();
    },
    onError: (err: any) => {
      if (err?.response?.data?.code === "CLASH_DETECTED") {
        setClashes(err.response.data.clashes ?? []);
        setPendingData(form.getValues());
        setShowClash(true);
      } else {
        showToast.error(errMsg(err));
      }
    },
  });

  function handleForceBook() {
    if (pendingData) mutation.mutate({ ...pendingData, force: true });
    setShowClash(false);
  }

  const allDay = form.watch("all_day");

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEdit ? "Edit Event" : "New Event"}
        size="md"
        surface="light"
        footer={
          <div className="flex items-center justify-between gap-3">
            {isEdit && (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (!confirm("Delete this event?")) return;
                  await deleteEvent(existing!.event_id);
                  qc.invalidateQueries({ queryKey: ["calendar-events"] });
                  onClose();
                }}
              >
                Delete
              </Button>
            )}
            <div className="flex gap-3 ml-auto">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={form.handleSubmit((v) =>
                  mutation.mutate(v as CreateEventValues),
                )}
                loading={mutation.isPending}
              >
                {isEdit ? "Save Changes" : "Create Event"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Controller
            name="title"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Title *"
                placeholder="e.g. Client Meeting with Adaeze"
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="event_type"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Type *"
                  options={EVENT_TYPE_OPTIONS}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  surface="light"
                />
              )}
            />
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  {...form.register("all_day")}
                  className="rounded"
                />
                <span className="text-text-on-light-muted">All day</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="start_at"
              control={form.control}
              render={({ field, fieldState }) => (
                <Input
                  {...field}
                  label="Start *"
                  type={allDay ? "date" : "datetime-local"}
                  surface="light"
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="end_at"
              control={form.control}
              render={({ field, fieldState }) => (
                <Input
                  {...field}
                  label="End *"
                  type={allDay ? "date" : "datetime-local"}
                  surface="light"
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>

          <Controller
            name="location"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                label="Location"
                placeholder="e.g. Lekki Showroom, Zoom"
                surface="light"
                leftIcon={<MapPin className="h-4 w-4 text-gray-400" />}
              />
            )}
          />

          <Controller
            name="description"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                label="Description / Agenda"
                placeholder="Add notes or agenda items"
                surface="light"
              />
            )}
          />

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                {...form.register("is_private")}
                className="rounded"
              />
              <Lock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-text-on-light-muted">
                Private — show as "Busy" to others
              </span>
            </label>
          </div>
        </div>
      </Modal>

      <ClashWarningModal
        open={showClash}
        clashes={clashes}
        onForce={handleForceBook}
        onCancel={() => setShowClash(false)}
      />
    </>
  );
}

// ── EventDetailPanel ──────────────────────────────────────────────────────────

interface EventDetailPanelProps {
  event: CalendarEvent;
  onEdit: () => void;
  onClose: () => void;
  currency?: string;
}

export function EventDetailPanel({
  event,
  onEdit,
  onClose,
}: EventDetailPanelProps) {
  const meta = EVENT_TYPE_META[event.event_type] ?? EVENT_TYPE_META.other;

  const { data: participants = [] } = useQuery({
    queryKey: ["event-participants", event.event_id],
    queryFn: () => listParticipants(event.event_id),
  });

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex items-start gap-3">
        <div
          className="h-3 w-3 rounded-full shrink-0 mt-1.5"
          style={{ backgroundColor: meta.color }}
        />
        <div className="flex-1">
          <p className="font-semibold text-brand-cream">{event.title}</p>
          <p className="text-xs text-brand-smoke mt-0.5">
            {fmtEventRange(event.start_at, event.end_at, event.all_day)}
          </p>
        </div>
        <EventTypeChip type={event.event_type} size="xs" />
      </div>

      {event.location && (
        <div className="flex items-start gap-2 text-sm text-brand-cloud">
          <MapPin className="h-4 w-4 shrink-0 text-brand-smoke mt-px" />
          {event.location}
        </div>
      )}

      {event.description && (
        <p className="text-sm text-brand-smoke whitespace-pre-wrap">
          {event.description}
        </p>
      )}

      {event.reference_type && (
        <div className="flex items-center gap-2 text-xs text-brand-smoke">
          <Link2 className="h-3.5 w-3.5" />
          {REF_TYPE_LABEL[event.reference_type] ?? event.reference_type}
        </div>
      )}

      {participants.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
            Participants
          </p>
          {participants.map((p) => (
            <div
              key={p.participant_id}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-brand-cloud">
                {p.display_name ?? "Unknown"}
              </span>
              <Badge
                tone={
                  p.status === "accepted"
                    ? "sage"
                    : p.status === "declined"
                      ? "danger"
                      : "neutral"
                }
                size="xs"
              >
                {p.status}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-white/5">
        <Button size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
