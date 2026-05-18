import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, LayoutGrid, Rows3, CalendarRange, BarChart3 } from 'lucide-react';
import { Topbar } from '@components/shell/Topbar';
import { PageHeader } from '@components/ui/PageHeader';
import { Button } from '@components/ui/Button';
import { ForecastStrip } from '@components/crm/shared/ForecastStrip';
import { PipelineBoard } from '@components/crm/pipeline/PipelineBoard';
import { PipelineTable } from '@components/crm/pipeline/PipelineTable';
import { PipelineCalendar } from '@components/crm/pipeline/PipelineCalendar';
import { PipelineForecast } from '@components/crm/pipeline/PipelineForecast';
import { NewDealModal } from '@components/crm/modals/NewDealModal';
import { getPipeline } from '@services/crm/pipeline';
import { cn } from '@lib/cn';

type View = 'table' | 'board' | 'calendar' | 'forecast';

const VIEWS: Array<{ key: View; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'table',    label: 'Table',    icon: Rows3 },
  { key: 'board',    label: 'Board',    icon: LayoutGrid },
  { key: 'calendar', label: 'Calendar', icon: CalendarRange },
  { key: 'forecast', label: 'Forecast', icon: BarChart3 },
];

export default function CrmHome() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<View>(() => (localStorage.getItem('orika_crm_view') as View) || (searchParams.get('view') as View) || 'table');
  const [creating, setCreating] = useState(false);
  const [stageForNew, setStageForNew] = useState<string | undefined>();

  useEffect(() => { localStorage.setItem('orika_crm_view', view); }, [view]);
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (view !== 'table') next.set('view', view); else next.delete('view');
    setSearchParams(next, { replace: true });
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useQuery({ queryKey: ['crm', 'pipeline'], queryFn: () => getPipeline(), refetchOnWindowFocus: true });

  return (
    <>
      <Topbar title="CRM" subtitle="Pipeline · Forecast · Concierge" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1500px] mx-auto">
        <PageHeader
          title="CRM"
          subtitle="Every conversation, every deal, every important date — for the people who buy from you."
          crumbs={[{ label: 'Hub', to: '/' }, { label: 'CRM' }]}
          actions={
            <>
              <div className="inline-flex p-0.5 rounded-xl bg-orika-charcoal border border-orika-graphite">
                {VIEWS.map((v) => {
                  const Icon = v.icon;
                  return (
                    <button
                      key={v.key}
                      onClick={() => setView(v.key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.65rem] font-semibold uppercase tracking-wide transition-all',
                        view === v.key ? 'bg-orika-graphite text-orika-cream' : 'text-orika-smoke hover:text-orika-cream',
                      )}
                      title={v.label}
                    >
                      <Icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{v.label}</span>
                    </button>
                  );
                })}
              </div>
              <Button variant="gold" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setStageForNew(undefined); setCreating(true); }}>
                New deal
              </Button>
            </>
          }
        />

        <ForecastStrip pipeline={data?.pipeline} loading={isLoading} />

        <div className="animate-fade-in">
          {view === 'table'    && <PipelineTable    pipeline={data?.pipeline} loading={isLoading} />}
          {view === 'board'    && <PipelineBoard    pipeline={data?.pipeline} loading={isLoading} onNewDeal={(s) => { setStageForNew(s); setCreating(true); }} />}
          {view === 'calendar' && <PipelineCalendar pipeline={data?.pipeline} loading={isLoading} />}
          {view === 'forecast' && <PipelineForecast pipeline={data?.pipeline} loading={isLoading} />}
        </div>
      </div>

      <NewDealModal
        open={creating}
        onClose={() => setCreating(false)}
        defaultStage={stageForNew}
        onCreated={(id) => navigate(`/crm/${id}`)}
      />
    </>
  );
}
