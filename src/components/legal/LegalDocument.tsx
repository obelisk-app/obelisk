import Container from '@/components/ui/layout/Container';
import Heading from '@/components/ui/layout/Heading';
import List from '@/components/ui/layout/List';
import Section from '@/components/ui/layout/Section';
import Text from '@/components/ui/layout/Text';
import Link from '@/components/ui/navigation/Link';
import { LEGAL_VALUES } from '@/constants/legal/contact';
import type { Translate } from '@/i18n/keys';
import type { LegalDocumentSpec } from '@/types/legal/document';

/**
 * A legal page: the privacy policy, the terms of use or the support page.
 * The page hands over its translator and its document (`src/constants/legal/`);
 * every sentence is server-rendered copy from the `legal` module.
 */
export default function LegalDocument({ t, doc }: { t: Translate; doc: LegalDocumentSpec }) {
  return (
    <div className="min-h-screen">
      <Container width="3xl" as="main" className="px-6 pb-24 pt-28" data-testid={`legal-${doc.id}`}>
        <Heading as="h1" variant="page">{t(doc.title)}</Heading>
        <Text as="p" variant="muted" className="mt-3" data-testid="legal-updated">{t(doc.updated)}</Text>
        <Text as="p" variant="lead" className="mt-5">{t(doc.intro, LEGAL_VALUES)}</Text>

        {doc.sections.map((section) => (
          <Section
            variant="prose" key={section.id} id={section.id} title={t(section.title)}
            className="scroll-mt-24" contentClassName="space-y-4" data-testid={`legal-section-${section.id}`}
          >
            {section.body?.map((key) => <Text as="p" key={key}>{t(key, LEGAL_VALUES)}</Text>)}
            {section.list && (
              <List>
                {section.list.map((key) => <Text as="li" key={key}>{t(key, LEGAL_VALUES)}</Text>)}
              </List>
            )}
            {section.after?.map((key) => <Text as="p" key={key}>{t(key, LEGAL_VALUES)}</Text>)}
            {section.links && (
              <List marker="none" spacing="tight">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} variant="prose">{t(link.label, LEGAL_VALUES)}</Link>
                  </li>
                ))}
              </List>
            )}
          </Section>
        ))}
      </Container>
    </div>
  );
}
