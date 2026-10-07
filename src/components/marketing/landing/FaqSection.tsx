'use client';

import { useTranslations } from 'next-intl';
import FaqItem from './FaqItem';
import Reveal from '@/components/ui/animations/Reveal';
import { FAQ_IDS } from '@/constants/marketing/landing';
import JsonLd from '@/components/seo/JsonLd';
import { faqJsonLd } from '@/utils/seo/jsonld';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

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
    <Reveal id="faq" className="py-24 px-6">
      {/* The same strings the accordion renders, so the markup matches the page. */}
      <JsonLd data={faqJsonLd(faqItems)} />
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.faq.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-xl mx-auto">
            {t('marketing.faq.subtitle')}
          </Text>
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
    </Reveal>
  );
}
