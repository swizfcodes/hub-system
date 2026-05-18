import { Link } from 'react-router-dom';
import { Sparkles, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react';
import { useGreeting } from '@hooks/useGreeting';
import { useAuthStore } from '@stores/useAuthStore';
import { useBusinessStore } from '@stores/useBusinessStore';
import { AppGrid } from '@components/hub/AppGrid';
import { HUB_MODULES } from '@lib/constants/modules';
import { Topbar } from '@components/shell/Topbar';

export default function HubHome() {
  const { time, greeting } = useGreeting();
  const user = useAuthStore((s) => s.user);
  const active = useBusinessStore((s) => s.active);

  const firstName = (user?.display_name || user?.email || '').split(' ')[0]?.split('@')[0] ?? '';

  // TODO: replace with a single dashboard endpoint that returns all live counts in one call.
  // For now: stub badges to demonstrate the UI; backend will fill these in once dashboards module ships.
  const badges: Record<string, number | string | undefined> = {
    new_leads: undefined,
    in_transit: undefined,
    pending_pos: undefined,
    overdue: undefined,
    awaiting_approval: undefined,
    unread: undefined,
    today: undefined,
    open: undefined,
  };

  return (
    <>
      <Topbar title="Hub" subtitle="Your command center" />

      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto">
        {/* Editorial hero */}
        <section className="mb-10 sm:mb-12 animate-app-in">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-[0.7rem] tracking-[0.18em] uppercase text-orika-gold mb-2">{greeting.primary}{firstName && `, ${firstName}`}</p>
              <h1 className="font-display font-light text-3xl sm:text-5xl lg:text-6xl leading-tight text-orika-cream">
                What would you like<br className="hidden sm:block" /> to <span className="italic text-orika-gold">craft</span> today?
              </h1>
              <p className="mt-3 text-sm sm:text-base text-orika-cloud max-w-xl">{greeting.secondary}</p>
            </div>
            <div className="text-left md:text-right shrink-0">
              <div className="font-mono text-2xl sm:text-3xl text-orika-gold tabular-nums tracking-wide leading-none">
                {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-[0.65rem] tracking-widest uppercase text-orika-smoke mt-1.5">
                {time.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {active && (
                <div className="mt-3 inline-flex items-center gap-1.5 text-[0.65rem] tracking-widest uppercase text-orika-gold">
                  <span className="w-1.5 h-1.5 rounded-full bg-orika-gold animate-pulse" />
                  {active}
                </div>
              )}
            </div>
          </div>

          {/* What's hot — critical alert tiles */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Link to="/invoicing" className="group p-4 sm:p-5 rounded-2xl border border-orika-graphite bg-gradient-to-br from-orika-gold/[0.04] to-transparent hover:border-orika-gold/40 transition-all">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-orika-gold/15 text-orika-gold flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.65rem] tracking-widest uppercase text-orika-smoke">Invoices · Overdue</div>
                  <div className="font-display text-2xl text-orika-cream mt-0.5">—</div>
                  <div className="text-xs text-orika-cloud mt-1 truncate">Wire dashboards module to populate</div>
                </div>
                <ArrowRight className="w-4 h-4 text-orika-smoke group-hover:text-orika-gold group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
            <Link to="/sales" className="group p-4 sm:p-5 rounded-2xl border border-orika-graphite bg-gradient-to-br from-living-sage/[0.04] to-transparent hover:border-living-sage/40 transition-all">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-living-sage/15 text-living-sage flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.65rem] tracking-widest uppercase text-orika-smoke">Today's Revenue</div>
                  <div className="font-display text-2xl text-orika-cream mt-0.5">—</div>
                  <div className="text-xs text-orika-cloud mt-1 truncate">Across active business</div>
                </div>
                <ArrowRight className="w-4 h-4 text-orika-smoke group-hover:text-living-sage group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
            <Link to="/crm" className="group p-4 sm:p-5 rounded-2xl border border-orika-graphite bg-gradient-to-br from-bejewelled-rose/[0.04] to-transparent hover:border-bejewelled-rose/40 transition-all">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-bejewelled-rose/15 text-bejewelled-rose flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.65rem] tracking-widest uppercase text-orika-smoke">New Leads</div>
                  <div className="font-display text-2xl text-orika-cream mt-0.5">—</div>
                  <div className="text-xs text-orika-cloud mt-1 truncate">Past 24 hours</div>
                </div>
                <ArrowRight className="w-4 h-4 text-orika-smoke group-hover:text-bejewelled-rose group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          </div>
        </section>

        {/* App Menu */}
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-5">
            <div className="text-[0.65rem] tracking-[0.18em] uppercase text-orika-gold">App Menu</div>
            <div className="flex-1 h-px bg-gradient-to-r from-orika-gold/30 to-transparent" />
          </div>
          <AppGrid modules={HUB_MODULES} badges={badges} />
        </section>

        {/* Recent activity strip — placeholder for now */}
        <section>
          <div className="flex items-center gap-4 mb-5">
            <div className="text-[0.65rem] tracking-[0.18em] uppercase text-orika-smoke">Recent Activity</div>
            <div className="flex-1 h-px bg-gradient-to-r from-orika-graphite to-transparent" />
          </div>
          <div className="rounded-2xl border border-orika-graphite bg-orika-charcoal/40 p-6 text-center">
            <p className="text-sm text-orika-smoke">Your recent activity will appear here once the audit feed is wired in.</p>
          </div>
        </section>
      </div>
    </>
  );
}
