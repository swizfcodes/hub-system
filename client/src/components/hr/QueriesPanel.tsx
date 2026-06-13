import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquareWarning } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Textarea } from "@components/ui/Textarea";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate } from "@lib/format";
import {
  getMyQueries,
  listQueries,
  respondToQuery,
  resolveQuery,
  type StaffQuery,
} from "@services/hr";

const STATUS_TONE: Record<string, Parameters<typeof Badge>[0]["tone"]> = {
  open: "warn",
  responded: "info",
  closed: "sage",
  escalated: "rose",
};

export function QueriesPanel({
  mode,
  profileId,
}: {
  mode: "self" | "manage";
  profileId?: string;
}) {
  const qc = useQueryClient();
  const [active, setActive] = useState<StaffQuery | null>(null);
  const [text, setText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: mode === "self" ? ["hr", "me", "queries"] : ["hr", "queries", profileId || "all"],
    queryFn: () => (mode === "self" ? getMyQueries() : listQueries({ profile_id: profileId })),
  });

  const respondMut = useMutation({
    mutationFn: () => respondToQuery(active!.query_id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success("Response sent");
      setActive(null);
      setText("");
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "closed" | "escalated" }) =>
      resolveQuery(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success("Query updated");
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const rows = data || [];
  if (!rows.length)
    return (
      <EmptyState
        icon={<MessageSquareWarning className="h-6 w-6" />}
        title={mode === "self" ? "No queries" : "No open queries"}
        description={
          mode === "self"
            ? "You have no HR queries to respond to."
            : "When you query a staff member, it shows up here until resolved."
        }
      />
    );

  return (
    <>
      <div className="space-y-3">
        {rows.map((q) => (
          <Card key={q.query_id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-brand-cream">{q.subject}</span>
                  <Badge tone={STATUS_TONE[q.status] || "neutral"} size="xs">
                    {q.status}
                  </Badge>
                  {q.severity === "high" && (
                    <Badge tone="rose" size="xs">
                      high
                    </Badge>
                  )}
                </div>
                {mode === "manage" && q.display_name && (
                  <div className="text-[0.65rem] text-brand-smoke">{q.display_name}</div>
                )}
                <p className="mt-1 text-sm text-brand-cloud">{q.details}</p>
                {q.response && (
                  <p className="mt-2 rounded-lg bg-brand-graphite/40 p-2 text-xs text-brand-cloud">
                    <span className="text-brand-smoke">Response: </span>
                    {q.response}
                  </p>
                )}
                <div className="mt-1 text-[0.6rem] text-brand-smoke">
                  {fmtDate(q.created_at)}
                  {q.due_date ? ` · respond by ${fmtDate(q.due_date)}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {mode === "self" && q.status !== "closed" && (
                  <Button size="sm" onClick={() => setActive(q)}>
                    {q.response ? "Update" : "Respond"}
                  </Button>
                )}
                {mode === "manage" && q.status !== "closed" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => resolveMut.mutate({ id: q.query_id, status: "closed" })}
                  >
                    Close
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!active}
        onClose={() => setActive(null)}
        title="Respond to query"
        description={active?.subject}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button onClick={() => respondMut.mutate()} disabled={!text.trim() || respondMut.isPending}>
              {respondMut.isPending ? "Sending…" : "Send response"}
            </Button>
          </>
        }
      >
        <Textarea
          label="Your response"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Explain the situation…"
        />
      </Modal>
    </>
  );
}
