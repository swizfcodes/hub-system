import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Calendar as CalendarIcon,
  ArrowUpRight,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Switch } from "@components/ui/Switch";
import { Badge } from "@components/ui/Badge";
import { EmptyState } from "@components/ui/EmptyState";
import { Skeleton } from "@components/ui/Skeleton";
import {
  listEventsForReference,
  createEvent,
} from "@services/contacts/calendar";
import {
  eventCreateSchema,
  EVENT_TYPES,
  type EventCreateValues,
} from "@lib/schemas/calendarEvent";
import { useBusinessStore } from "@stores/useBusinessStore";
import { fmtDateTime, fmtDate } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { CalendarEvent, ClashResponse } from "@typedefs/calendar";
import type { AxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function CalendarTab({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const [adding, setAdding] = useState(false);
  const { data: events, isLoading } = useQuery({
    queryKey: ["contacts", contactId, "events"],
    queryFn: () => listEventsForReference("contact", contactId),
  });

  const now = Date.now();
  const upcoming = (events ?? []).filter(
    (e) => new Date(e.end_at).getTime() >= now,
  );
  const past = (events ?? []).filter((e) => new Date(e.end_at).getTime() < now);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-brand-cloud">
          {upcoming.length} upcoming · {past.length} past
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/calendar?reference_type=contact&reference_id=${contactId}`}
            className="inline-flex items-center gap-1.5 text-xs text-brand-smoke hover:text-brand-cream transition-colors"
          >
            Open in Calendar <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <Button
            variant="gold"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setAdding(true)}
          >
            Schedule
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (events ?? []).length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="w-6 h-6" />}
          title="No events yet"
          description={`Schedule the first event with ${contactName}.`}
          action={
            <Button
              variant="gold"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setAdding(true)}
            >
              Schedule
            </Button>
          }
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <EventGroup label="Upcoming" events={upcoming} />
          )}
          {past.length > 0 && <EventGroup label="Past" events={past} muted />}
        </>
      )}

      <ScheduleEventModal
        open={adding}
        onClose={() => setAdding(false)}
        contactId={contactId}
        contactName={contactName}
      />
    </div>
  );
}

function EventGroup({
  label,
  events,
  muted,
}: {
  label: string;
  events: CalendarEvent[];
  muted?: boolean;
}) {
  return (
    <section>
      <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3">
        {label}
      </h3>
      <div className="space-y-2">
        {events.map((e) => (
          <EventRow key={e.event_id} event={e} muted={muted} />
        ))}
      </div>
    </section>
  );
}

function EventRow({ event, muted }: { event: CalendarEvent; muted?: boolean }) {
  return (
    <Card className={`p-4 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 h-12 rounded-lg bg-brand-black/30 border border-brand-graphite text-center flex flex-col items-center justify-center">
          <div className="text-[0.5rem] uppercase tracking-widest text-brand-smoke">
            {fmtDate(event.start_at, "MMM")}
          </div>
          <div className="text-base font-display text-brand-cream leading-none">
            {fmtDate(event.start_at, "d")}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-brand-cream">
              {event.title}
            </span>
            <Badge tone="neutral" size="xs">
              {event.event_type}
            </Badge>
            {event.all_day && (
              <Badge tone="info" size="xs">
                All-day
              </Badge>
            )}
          </div>
          <div className="text-[0.65rem] text-brand-smoke mt-0.5">
            {fmtDateTime(event.start_at)} — {fmtDateTime(event.end_at)}
          </div>
          {event.location && (
            <div className="inline-flex items-center gap-1.5 text-[0.65rem] text-brand-cloud mt-1">
              <MapPin className="w-3 h-3" /> {event.location}
            </div>
          )}
          {event.description && (
            <p className="text-xs text-brand-cloud mt-1.5">
              {event.description}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function ScheduleEventModal({
  open,
  onClose,
  contactId,
  contactName,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
}) {
  const qc = useQueryClient();
  const active = useBusinessStore((s) => s.active);
  const [clashes, setClashes] = useState<ClashResponse["clashes"] | null>(null);

  const {
    register,
    handleSubmit,
    control: _c,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<EventCreateValues>({
    resolver: zodResolver(eventCreateSchema),
    defaultValues: {
      business: active ?? "",
      title: `Meeting with ${contactName}`,
      event_type: "meeting",
      start_at: "",
      end_at: "",
      all_day: false,
      location: "",
      description: "",
      reference_type: "contact",
      reference_id: contactId,
    },
  });

  const allDay = watch("all_day");

  const submit = (force: boolean) => async (v: EventCreateValues) => {
    try {
      await createEvent({
        ...v,
        start_at: new Date(v.start_at).toISOString(),
        end_at: new Date(v.end_at).toISOString(),
        location: v.location || undefined,
        description: v.description || undefined,
        force,
      });
      qc.invalidateQueries({ queryKey: ["contacts", contactId, "events"] });
      showToast.success("Event scheduled");
      reset();
      setClashes(null);
      onClose();
    } catch (e) {
      const err = e as AxiosError<ClashResponse>;
      if (
        err.response?.status === 409 &&
        err.response.data?.code === "CLASH_DETECTED"
      ) {
        setClashes(err.response.data.clashes);
        return;
      }
      showToast.error("Could not schedule", errMsg(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        setClashes(null);
        onClose();
      }}
      surface="light"
      size="md"
      title="Schedule event"
      description={`Linked to ${contactName}`}
      footer={
        <>
          <Button
            variant="outline-light"
            onClick={() => {
              reset();
              setClashes(null);
              onClose();
            }}
          >
            Cancel
          </Button>
          {clashes ? (
            <Button variant="danger" onClick={handleSubmit(submit(true))}>
              Override clash
            </Button>
          ) : (
            <Button variant="primary" onClick={handleSubmit(submit(false))}>
              Schedule
            </Button>
          )}
        </>
      }
    >
      <form className="space-y-4">
        {clashes && clashes.length > 0 && (
          <div className="p-3 rounded-xl bg-state-warn/[0.08] border border-state-warn/30 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-state-warn mt-0.5 shrink-0" />
            <div className="text-xs text-brand-black/80">
              <strong>Clash detected.</strong> This room/location is already
              booked:
              <ul className="mt-1 list-disc pl-4">
                {clashes.map((c) => (
                  <li key={c.event_id}>
                    {c.title} · {fmtDateTime(c.start_at)} —{" "}
                    {fmtDateTime(c.end_at)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <Input
          {...register("title")}
          label="Title"
          error={errors.title?.message}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            {...register("event_type")}
            label="Type"
            options={EVENT_TYPES.map((t) => ({
              value: t,
              label: t.charAt(0).toUpperCase() + t.slice(1),
            }))}
          />
          <Input
            {...register("location")}
            label="Location"
            placeholder="Showroom, Zoom, address…"
          />
        </div>
        <div className="p-3 rounded-xl bg-brand-cream/40 border border-brand-cloud/40">
          <Switch
            surface="light"
            checked={!!allDay}
            onChange={(v) => setValue("all_day", v)}
            label="All-day event"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            {...register("start_at")}
            type={allDay ? "date" : "datetime-local"}
            label="Start"
            error={errors.start_at?.message}
          />
          <Input
            {...register("end_at")}
            type={allDay ? "date" : "datetime-local"}
            label="End"
            error={errors.end_at?.message}
          />
        </div>
        <Textarea {...register("description")} label="Notes (optional)" />
      </form>
    </Modal>
  );
}
