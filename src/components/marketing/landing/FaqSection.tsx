'use client';

import { useTranslation } from '@/i18n/context';
import FAQItem from '../FAQItem';
import RevealSection from './RevealSection';
import { FAQ_IDS } from './landing-data';

/**
 * The FAQ accordion, with its FAQPage JSON-LD for search engines.
 */
export default function FaqSection() {
  const { t } = useTranslation();
  const faqItems = FAQ_IDS.map((id) => ({
    id,
    question: t(`faq.${id}.question`),
    answer: t(`faq.${id}.answer`),
  }));
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
  return (
    <RevealSection id="faq" className="py-24 px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('faq.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg max-w-xl mx-auto">
            {t('faq.subtitle')}
          </p>
        </div>
        <div className="space-y-3">
          {faqItems.map((item) => (
            <FAQItem
              key={item.id}
              id={item.id}
              question={item.question}
              answer={item.answer}
            />
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
