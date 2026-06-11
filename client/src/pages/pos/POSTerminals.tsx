import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Monitor, ChevronRight, Plus, MapPin } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { api } from "@services/api";
import { listTerminals, createTerminal } from "@services/pos/terminals";
import { openSession } from "@services/pos/sessions";
import { usePOSStore } from "@stores/posStore";
import { SESSION_STATUS_META } from "@lib/constants/posConstants";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";
import type { PosTerminal } from "@typedefs/pos";
import { Topbar } from "@/components/shell/Topbar";

export default function POSTerminals() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();
  const { setTerminal, setSession } = usePOSStore((s) => ({
    setTerminal: s.setTerminal,
    setSession: s.setSession,
  }));

  // Open-session state
  const [selected, setSelected] = useState<PosTerminal | null>(null);
  const [openingFloat, setOpeningFloat] = useState<number | undefined>(
    undefined,
  );
  const [showOpen, setShowOpen] = useState(false);

  // Create-terminal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [locationId, setLocationId] = useState("");

  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ["pos-terminals"],
    queryFn: listTerminals,
    refetchInterval: 30_000,
  });

  // Fetch stock locations for terminal creation dropdown
  const { data: locationsData } = useQuery({
    queryKey: ["stock-locations-for-pos"],
    queryFn: () =>
      api
        .get<{
          data: Array<{ location_id: string; name: string }>;
        }>("/catalogue/locations")
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const locations = locationsData?.data ?? [];

  const openMutation = useMutation({
    mutationFn: () =>
      openSession({
        terminal_id: selected!.terminal_id,
        opening_float: openingFloat ?? 0,
      }),
    onSuccess: (session) => {
      setTerminal(selected!);
      setSession(session);
      showToast.success(`Session opened on ${selected!.name}`);
      navigate(`/pos/session/${session.session_id}`);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createTerminal({ name: newName.trim(), location_id: locationId }),
    onSuccess: (terminal) => {
      qc.invalidateQueries({ queryKey: ["pos-terminals"] });
      showToast.success(`Terminal "${terminal.name}" created`);
      setShowCreate(false);
      setNewName("");
      setLocationId("");
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function handleClick(terminal: PosTerminal) {
    if (terminal.session_id) {
      setTerminal(terminal);
      navigate(`/pos/session/${terminal.session_id}`);
    } else {
      setSelected(terminal);
      setShowOpen(true);
    }
  }

  return (
    <>
      <Topbar title="POS" subtitle="Terminals · Sessions" />
      <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto space-y-6">
        <Breadcrumbs items={[{ label: "Hub", to: "/" }, { label: "POS" }]} />

        <PageHeader
          title="Point of Sale"
          subtitle="Select a terminal to start or resume a session."
          actions={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New Terminal
            </Button>
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : terminals.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-brand-charcoal/40 py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-graphite">
              <Monitor className="h-7 w-7 text-brand-accent" />
            </div>
            <p className="font-semibold text-brand-cream">No terminals yet</p>
            <p className="mt-1 text-sm text-brand-smoke">
              Create your first terminal to start taking sales.
            </p>
            <Button className="mt-6" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Create Terminal
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {terminals.map((terminal) => {
              const hasSession = !!terminal.session_id;
              const statusKey = terminal.session_status ?? "closed";
              const meta =
                SESSION_STATUS_META[
                  statusKey as keyof typeof SESSION_STATUS_META
                ];

              return (
                <button
                  key={terminal.terminal_id}
                  onClick={() => handleClick(terminal)}
                  className={cn(
                    "flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all",
                    hasSession
                      ? "border-brand-accent/40 bg-brand-accent/5 hover:border-brand-accent/60"
                      : "border-white/5 bg-brand-charcoal hover:border-white/15",
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-graphite">
                      <Monitor className="h-5 w-5 text-brand-accent" />
                    </div>
                    {hasSession && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
                        style={{
                          backgroundColor: `${meta?.color}1F`,
                          color: meta?.color,
                        }}
                      >
                        Live
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="font-semibold text-brand-cream">
                      {terminal.name}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-brand-smoke">
                      <MapPin className="h-3 w-3" />
                      {terminal.location_name}
                    </p>
                  </div>

                  {hasSession && terminal.total_revenue !== null && (
                    <div className="flex w-full items-center justify-between text-xs">
                      <span className="text-brand-smoke">Revenue</span>
                      <span className="font-medium text-brand-accent tabular-nums">
                        {fmtMoney(terminal.total_revenue ?? 0, currency)}
                      </span>
                    </div>
                  )}

                  <div className="mt-auto flex w-full items-center justify-between">
                    <span className="text-xs text-brand-smoke">
                      {hasSession ? "Resume session" : "Open new session"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-brand-smoke" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Session history link */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/pos/sessions")}
          >
            Session History
          </Button>
        </div>

        {/* Open session modal */}
        <Modal
          open={showOpen}
          onClose={() => setShowOpen(false)}
          title={`Open Session — ${selected?.name}`}
          size="sm"
          surface="light"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => openMutation.mutate()}
                loading={openMutation.isPending}
              >
                Open Session
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-brand-smoke/80">
              Count the opening float before starting your shift.
            </p>
            <NumberField
              label="Opening Float (optional)"
              decimal
              surface="light"
              value={openingFloat}
              onValueChange={setOpeningFloat}
              placeholder="₦0.00"
            />
          </div>
        </Modal>

        {/* Create terminal modal */}
        <Modal
          open={showCreate}
          onClose={() => {
            setShowCreate(false);
            setNewName("");
            setLocationId("");
          }}
          title="New Terminal"
          size="sm"
          surface="light"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                loading={createMutation.isPending}
                disabled={!newName.trim() || !locationId}
              >
                Create Terminal
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Terminal Name <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Counter 1, Main Register"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Location <span className="text-red-400">*</span>
              </label>
              {locations.length === 0 ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-900/10 px-3 py-2 text-xs text-amber-300">
                  No stock locations found. Please create a location in Stock
                  settings first.
                </p>
              ) : (
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-brand-charcoal px-3 py-2 text-sm text-brand-cream focus:border-brand-accent/40 focus:outline-none"
                >
                  <option value="">Select a location…</option>
                  {locations.map((l) => (
                    <option key={l.location_id} value={l.location_id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
}
