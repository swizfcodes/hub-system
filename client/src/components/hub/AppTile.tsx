import { useNavigate } from 'react-router-dom';
import type { AppModule } from '@lib/constants/modules';
import { cn } from '@lib/cn';

interface Props {
  module: AppModule;
  badge?: number | string;
  index?: number;
}

const accentBg: Record<AppModule['accent'], string> = {
  gold:  'group-hover:bg-orika-gold/[0.06]',
  rose:  'group-hover:bg-bejewelled-rose/[0.06]',
  sage:  'group-hover:bg-living-sage/[0.06]',
  mixed: 'group-hover:bg-orika-gold/[0.06]',
};

const accentBorder: Record<AppModule['accent'], string> = {
  gold:  'group-hover:border-orika-gold/40',
  rose:  'group-hover:border-bejewelled-rose/40',
  sage:  'group-hover:border-living-sage/40',
  mixed: 'group-hover:border-orika-gold/40',
};

const accentIcon: Record<AppModule['accent'], string> = {
  gold:  'text-orika-gold',
  rose:  'text-bejewelled-rose',
  sage:  'text-living-sage',
  mixed: 'text-orika-gold',
};

const badgeTone: Record<AppModule['accent'], string> = {
  gold:  'bg-orika-gold text-orika-black',
  rose:  'bg-bejewelled-rose text-orika-cream',
  sage:  'bg-living-sage text-orika-black',
  mixed: 'bg-orika-cream text-orika-black',
};

export function AppTile({ module, badge, index = 0 }: Props) {
  const navigate = useNavigate();
  const Icon = module.icon;

  return (
    <button
      onClick={() => navigate(module.route)}
      style={{ animationDelay: `${index * 30}ms` }}
      className={cn(
        'group relative flex flex-col items-center justify-center text-center gap-3 p-5 sm:p-6 rounded-2xl',
        'bg-orika-charcoal/60 border border-orika-graphite transition-all duration-300',
        'hover:-translate-y-1 hover:shadow-card-lg animate-tile-in',
        accentBg[module.accent], accentBorder[module.accent],
      )}
    >
      {badge !== undefined && badge !== 0 && (
        <span className={cn(
          'absolute -top-2 -right-2 min-w-[24px] h-6 px-2 rounded-full text-[0.65rem] font-bold flex items-center justify-center border-2 border-orika-charcoal',
          badgeTone[module.accent],
        )}>
          {badge}
        </span>
      )}
      <div className={cn('w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-orika-black/40 flex items-center justify-center transition-transform group-hover:scale-110', accentIcon[module.accent])}>
        <Icon className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={1.5} />
      </div>
      <div className="space-y-0.5">
        <div className="font-semibold text-xs sm:text-sm text-orika-cream">{module.label}</div>
        <div className="text-[0.65rem] sm:text-xs text-orika-smoke line-clamp-2 leading-snug max-w-[140px]">
          {module.description}
        </div>
      </div>
    </button>
  );
}
