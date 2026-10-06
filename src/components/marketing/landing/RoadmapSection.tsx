'use client';

import { useTranslations } from 'next-intl';
import RevealSection from './RevealSection';
import { ROADMAP_PHASES } from './landing-data';

/**
 * The roadmap as a vertical timeline.
 */
export default function RoadmapSection() {
  const t = useTranslations();
  return (
    <RevealSection id="roadmap" className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('marketing.roadmap.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg max-w-xl mx-auto">
            {t('marketing.roadmap.subtitle')}
          </p>
        </div>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 md:left-6 top-0 bottom-0 w-px bg-gradient-to-b from-lc-green/40 via-lc-green/20 to-lc-border" />

          <div className="space-y-8">
            {ROADMAP_PHASES.map((r) => {
              const items = t(`marketing.roadmap.${r.key}.items`).split('|');
              return (
                <div key={r.key} className="relative pl-12 md:pl-16">
                  {/* Timeline dot */}
                  <div className={`absolute left-2.5 md:left-4.5 top-1.5 w-3 h-3 rounded-full border-2 ${
                    r.status === 'done'
                      ? 'bg-lc-green border-lc-green'
                      : 'bg-lc-dark border-lc-border'
                  }`} />

                  <div className="lc-card p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold text-lc-green">{r.phase}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.status === 'done'
                          ? 'bg-lc-green/20 text-lc-green'
                          : 'bg-lc-border text-lc-muted'
                      }`}>
                        {r.status === 'done' ? `✓ ${t('marketing.roadmap.done')}` : t('marketing.roadmap.upcoming')}
                      </span>
                    </div>
                    <h4 className="text-lg font-semibold text-lc-white mb-2">{t(`marketing.roadmap.${r.key}.title`)}</h4>
                    <ul className="space-y-1">
                      {items.map((item) => (
                        <li key={item} className="text-sm text-lc-muted flex items-start gap-2">
                          {r.status === 'done' ? (
                            <span className="text-lc-green mt-0.5 text-xs">✓</span>
                          ) : (
                            <span className="text-lc-border mt-1.5 text-[8px]">●</span>
                          )}
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </RevealSection>
  );
}
