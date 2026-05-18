import { cn } from '@lib/cn';

interface Props {
  probability: number;   // 0-100
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const TONES = [
  { max: 25,  bg: 'bg-state-danger',    text: 'text-state-danger',   label: 'Cold' },
  { max: 50,  bg: 'bg-state-warn',      text: 'text-state-warn',     label: 'Warm' },
  { max: 75,  bg: 'bg-living-sage',     text: 'text-living-sage',    label: 'Hot' },
  { max: 100, bg: 'bg-orika-gold',      text: 'text-orika-gold',     label: 'Likely' },
];

export function ProbabilityBar({ probability, size = 'sm', showLabel, className }: Props) {
  const safe = Math.max(0, Math.min(100, probability ?? 0));
  const tone = TONES.find((t) => safe <= t.max) ?? TONES[0];
  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-[0.6rem] uppercase tracking-widest text-orika-smoke">Probability</span>
          <span className={cn('text-[0.65rem] font-semibold', tone.text)}>{safe}% · {tone.label}</span>
        </div>
      )}
      <div className={cn('w-full rounded-full bg-orika-graphite overflow-hidden', size === 'sm' ? 'h-1' : 'h-1.5')}>
        <div className={cn('h-full transition-all duration-500', tone.bg)} style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}
