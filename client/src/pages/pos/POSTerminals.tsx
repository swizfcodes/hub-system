import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Monitor, ChevronRight } from 'lucide-react';
import { PageHeader } from '@components/ui/PageHeader';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { Button } from '@components/ui/Button';
import { Skeleton } from '@components/ui/Skeleton';
import { Modal } from '@components/ui/Modal';
import { Input } from '@components/ui/Input';
import { listTerminals } from '@services/pos/terminals';
import { openSession } from '@services/pos/sessions';
import { usePOSStore } from '@stores/posStore';
import { SESSION_STATUS_META } from '@lib/constants/posConstants';
import { fmtMoney } from '@lib/format';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { cn } from '@lib/cn';
import type { PosTerminal } from '@typedefs/pos';
import { Topbar } from '@/components/shell/Topbar';

export default function POSTerminals() {
  const navigate     = useNavigate();
  const { currency } = useActiveBusiness();
  const { setTerminal, setSession } = usePOSStore((s) => ({
    setTerminal: s.setTerminal,
    setSession:  s.setSession,
  }));

  const [selected,     setSelected]     = useState<PosTerminal | null>(null);
  const [openingFloat, setOpeningFloat] = useState('');
  const [showOpen,     setShowOpen]     = useState(false);

  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ['pos-terminals'],
    queryFn:  listTerminals,
    refetchInterval: 30_000,
  });

  const mutation = useMutation({
    mutationFn: () =>
      openSession({
        terminal_id:   selected!.terminal_id,
        opening_float: parseFloat(openingFloat) || 0,
      }),
    onSuccess: (session) => {
      setTerminal(selected!);
      setSession(session);
      showToast.success(`Session opened on ${selected!.name}`);
      navigate(`/pos/session/${session.session_id}`);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function handleClick(terminal: PosTerminal) {
    if (terminal.session_id) {
      // Resume existing session
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
        <Breadcrumbs items={[{ label: 'Hub', to: '/' }, { label: 'POS' }]} />

      <PageHeader
        title="Point of Sale"
        subtitle="Select a terminal to start or resume a session."
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {terminals.map((terminal) => {
            const hasSession  = !!terminal.session_id;
            const statusKey   = terminal.session_status ?? 'closed';
            const meta        = SESSION_STATUS_META[statusKey as keyof typeof SESSION_STATUS_META];

            return (
              <button
                key={terminal.terminal_id}
                onClick={() => handleClick(terminal)}
                className={cn(
                  'flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all',
                  hasSession
                    ? 'border-orika-gold/40 bg-orika-gold/5 hover:border-orika-gold/60'
                    : 'border-white/5 bg-orika-charcoal hover:border-white/15',
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orika-graphite">
                    <Monitor className="h-5 w-5 text-orika-gold" />
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
                  <p className="font-semibold text-orika-cream">{terminal.name}</p>
                  <p className="text-xs text-orika-smoke">{terminal.location_name}</p>
                </div>

                {hasSession && terminal.total_revenue !== null && (
                  <div className="flex w-full items-center justify-between text-xs">
                    <span className="text-orika-smoke">Revenue</span>
                    <span className="font-medium text-orika-gold tabular-nums">
                      {fmtMoney(terminal.total_revenue ?? 0, currency)}
                    </span>
                  </div>
                )}

                <div className="mt-auto flex w-full items-center justify-between">
                  <span className="text-xs text-orika-smoke">
                    {hasSession ? 'Resume session' : 'Open new session'}
                  </span>
                  <ChevronRight className="h-4 w-4 text-orika-smoke" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Session history link */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => navigate('/pos/sessions')}>
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
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
              Open Session
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-orika-smoke/80">
            Count the opening float before starting your shift.
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-orika-smoke">
              Opening Float (optional)
            </label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              placeholder="₦0.00"
            />
          </div>
        </div>
      </Modal>
    </div>
    </>
  );
}
