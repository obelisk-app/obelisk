'use client';

import { useTranslations } from 'next-intl';
import FaqItem from './FaqItem';
import RevealSection from './RevealSection';
import { FAQ_IDS } from './landing-data';
import JsonLd from '@/components/seo/JsonLd';
import { faqJsonLd } from '@/utils/seo/jsonld';

/**
 * The FAQ accordion, with its FAQPage JSON-LD for search engines.
 */
export default function FaqSection() {
  const t = useTranslations();
  const faqItems = FAQ_IDS.map((id) => ({
    id,
    question: t(`marketing.faq.${id}.question`),
    answer: t(`marketing.faq.${id}.answer`),
  }));
  return (
    <RevealSection id="faq" className="py-24 px-6">
      {/* The same strings the accordion renders, so the markup matches the page. */}
      <JsonLd data={faqJsonLd(faqItems)} />
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('marketing.faq.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg max-w-xl mx-auto">
            {t('marketing.faq.subtitle')}
          </p>
        </div>
        <div className="space-y-3">
          {faqItems.map((item) => (
            <FaqItem
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
