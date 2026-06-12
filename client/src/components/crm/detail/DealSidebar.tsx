import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NumberField } from "@components/ui/NumberField";
import {
  Star,
  Pencil,
  Hash,
  ArrowUpRight,
  Calendar,
  User,
  Banknote,
  Percent,
} from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { StagePill } from "../shared/StagePill";
import { fmtMoney, fmtDate } from "@lib/format";
import { updateDeal, moveDealStage } from "@services/crm/deals";
import { getPipeline } from "@services/crm/pipeline";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { Deal } from "@typedefs/crm";
import { ContactAvatar } from "@components/contacts/shared/ContactAvatar";
import { QuickActions } from "@components/contacts/shared/QuickActions";
import { cn } from "@lib/cn";

interface Props {
  deal: Deal;
}

export function DealSidebar({ deal }: Props) {
  const qc = useQueryClient();
  const [editingValue, setEditingValue] = useState(false);

  const { data: pipeline } = useQuery({
    queryKey: ["crm", "pipeline"],
    queryFn: () => getPipeline(),
  });

  const move = useMutation({
    mutationFn: (stage: string) => moveDealStage(deal.deal_id, stage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm"] });
      showToast.success("Stage updated");
    },
    onError: (e) => showToast.error("Could not move", errMsg(e)),
  });

  return (
    <aside className="lg:sticky lg:top-24 self-start space-y-3 lg:max-w-[340px]">
      {/* Contact card */}
      <Card className="p-4">
        <Link
          to={`/contacts/${deal.contact_id}`}
          className="flex items-center gap-3 group"
        >
          <ContactAvatar
            contact={{
              display_name: deal.contact_name ?? "?",
              contact_type: ["customer"],
            }}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm text-brand-cream truncate group-hover:text-brand-accent transition-colors">
                {deal.contact_name}
              </span>
              {deal.priority_level === "vip" && (
                <Star className="w-3 h-3 fill-brand-accent text-brand-accent" />
              )}
            </div>
            <span className="text-[0.65rem] text-brand-smoke">
              Open contact <ArrowUpRight className="inline w-2.5 h-2.5" />
            </span>
          </div>
        </Link>
        <div className="mt-3 pt-3 border-t border-brand-graphite/70">
          <QuickActions
            contact={{
              primary_phone: deal.primary_phone ?? "",
              whatsapp_number: deal.whatsapp_number,
              email: deal.email,
            }}
            size="sm"
          />
        </div>
      </Card>

      {/* Stage card */}
      <Card className="p-4">
        <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke mb-2">
          Stage
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(pipeline?.pipeline ?? []).map((s) => {
            const active = s.stage_key === deal.stage;
            return (
              <button
                key={s.stage_key}
                onClick={() => !active && move.mutate(s.stage_key)}
                disabled={move.isPending}
                className={cn(
                  "transition-all",
                  active &&
                    "ring-2 ring-offset-2 ring-offset-brand-charcoal rounded-full",
                )}
                style={active ? { boxShadow: `0 0 0 2px ${s.colour}` } : {}}
              >
                <StagePill
                  stageKey={s.stage_key}
                  label={s.stage_label}
                  colour={s.colour}
                />
              </button>
            );
          })}
        </div>
      </Card>

      {/* Value card */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
            Value
          </div>
          <button
            onClick={() => setEditingValue(true)}
            className="text-brand-smoke hover:text-brand-accent transition-colors"
            aria-label="Edit"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
        <div className="text-2xl font-display text-brand-accent tabular-nums">
          {fmtMoney(deal.expected_value, "NGN")}
        </div>
      </Card>

      {/* Key fields */}
      <Card className="p-4">
        <div className="space-y-2.5 text-xs">
          <Row
            icon={<Calendar className="w-3 h-3" />}
            label="Expected close"
            value={
              deal.expected_close_date ? fmtDate(deal.expected_close_date) : "—"
            }
          />
          <Row
            icon={<User className="w-3 h-3" />}
            label="Owner"
            value={deal.assigned_to_email ?? "Unassigned"}
          />
          <Row
            icon={<Hash className="w-3 h-3" />}
            label="Source"
            value={deal.source ?? "—"}
            mono
          />
          <Row
            icon={<Banknote className="w-3 h-3" />}
            label="Created"
            value={fmtDate(deal.created_at)}
          />
          {deal.won_at && (
            <Row
              icon={<Percent className="w-3 h-3" />}
              label="Won"
              value={fmtDate(deal.won_at)}
              className="text-accent2"
            />
          )}
          {deal.lost_at && (
            <Row
              icon={<Percent className="w-3 h-3" />}
              label="Lost"
              value={`${fmtDate(deal.lost_at)}${deal.lost_reason ? ` — ${deal.lost_reason}` : ""}`}
              className="text-state-danger"
            />
          )}
        </div>
      </Card>

      <EditValueModal
        open={editingValue}
        onClose={() => setEditingValue(false)}
        deal={deal}
      />
    </aside>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-brand-smoke shrink-0 mt-0.5">{icon}</span>
      <span className="text-brand-smoke shrink-0 w-24">{label}</span>
      <span
        className={cn(
          "flex-1 min-w-0 truncate",
          mono && "font-mono",
          className ?? "text-brand-cream",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function EditValueModal({
  open,
  onClose,
  deal,
}: {
  open: boolean;
  onClose: () => void;
  deal: Deal;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState<number | "">(deal.expected_value ?? "");
  const [closeDate, setClose] = useState(
    deal.expected_close_date?.slice(0, 10) ?? "",
  );

  const mutation = useMutation({
    mutationFn: () =>
      updateDeal(deal.deal_id, {
        expected_value: value === "" ? undefined : Number(value),
        expected_close_date: closeDate || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm"] });
      showToast.success("Saved");
      onClose();
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      surface="light"
      size="sm"
      title="Edit deal value"
      footer={
        <>
          <Button variant="outline-light" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <NumberField
          surface="light"
          decimal
          label="Expected value (NGN)"
          placeholder="0.00"
          value={value === "" ? undefined : value}
          onValueChange={(v) => setValue(v ?? "")}
        />
        <Input
          type="date"
          label="Expected close date"
          value={closeDate}
          onChange={(e) => setClose(e.target.value)}
        />
      </div>
    </Modal>
  );
}
