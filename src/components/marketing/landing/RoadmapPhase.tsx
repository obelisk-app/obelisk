import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import type { ROADMAP_PHASES } from '@/constants/marketing/landing';
import Heading from '@/components/ui/layout/Heading';

type Phase = (typeof ROADMAP_PHASES)[number];

/** One phase on the roadmap timeline: its dot, number, status pill, title and items (ticked once done). */
export default function RoadmapPhase({ phase }: { phase: Phase }) {
  const t = useTranslations();
  const items = t(`marketing.roadmap.${phase.key}.items`).split('|');
  const done = phase.status === 'done';
  return (
    <div className="relative pl-12 md:pl-16">
      {/* Timeline dot */}
      <div className={`absolute left-2.5 md:left-4.5 top-1.5 w-3 h-3 rounded-full border-2 ${done
        ? 'bg-lc-green border-lc-green'
        : 'bg-lc-dark border-lc-border'
        }`} />

      <Card variant="interactive" padding="xl">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-bold text-lc-green">{t('marketing.roadmap.phaseLabel', { n: phase.num })}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${done
            ? 'bg-lc-green/20 text-lc-green'
            : 'bg-lc-border text-lc-muted'
            }`}>
            {done ? `✓ ${t('marketing.roadmap.done')}` : t('marketing.roadmap.upcoming')}
          </span>
        </div>
        <Heading as="h3" variant="card" className="mb-2">{t(`marketing.roadmap.${phase.key}.title`)}</Heading>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item} className="text-sm text-lc-muted flex items-start gap-2">
              {done ? (
                <span className="text-lc-green mt-0.5 text-xs">✓</span>
              ) : (
                <span className="text-lc-border mt-1.5 text-[8px]">●</span>
              )}
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
