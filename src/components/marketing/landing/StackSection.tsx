'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Reveal from '@/components/ui/animations/Reveal';
import { TECH_STACK } from './landing-data';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The tech stack cards, each linking out.
 */
export default function StackSection() {
  const t = useTranslations();
  return (
    <Reveal id="stack" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.stack.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-xl mx-auto">
            {t('marketing.stack.subtitle')}
          </Text>
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
                  <Heading as="h3" className={`text-sm font-bold ${tech.color} group-hover:scale-105 transition-transform origin-left`}>
                    {tech.name}
                  </Heading>
                  <Text as="p" variant="caption">{t(tech.descKey)}</Text>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
