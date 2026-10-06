'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import RevealSection from './RevealSection';
import { TECH_STACK } from './landing-data';

/**
 * The tech stack cards, each linking out.
 */
export default function StackSection() {
  const t = useTranslations();
  return (
    <RevealSection id="stack" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('marketing.stack.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg max-w-xl mx-auto">
            {t('marketing.stack.subtitle')}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {TECH_STACK.map((tech) => (
            <a
              key={tech.name}
              href={tech.href}
              target="_blank"
              rel="noopener noreferrer"
              className="lc-card p-5 group hover:border-lc-green/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                {tech.img ? (
                  <Image src={tech.img} alt={tech.name} width={40} height={40} className="w-10 h-10 rounded-lg shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-lc-olive/30 flex items-center justify-center text-sm shrink-0">
                    <span className={tech.color}>{tech.icon}</span>
                  </div>
                )}
                <div>
                  <h3 className={`text-sm font-bold ${tech.color} group-hover:scale-105 transition-transform origin-left`}>
                    {tech.name}
                  </h3>
                  <p className="text-xs text-lc-muted">{t(tech.descKey)}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
