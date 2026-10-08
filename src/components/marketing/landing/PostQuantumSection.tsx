import { useTranslations } from 'next-intl';
import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import Link from '@/components/ui/navigation/Link';
import Image from 'next/image';
import { guidePath } from '@/utils/guides/guide-urls';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/* Post-quantum messages: joint work with Nostr WoT + QuantaKrypto.
  This copy used to be written as in-development because DMs were still
  NIP-04. That shipped: DMs are gift-wrapped by default and carry a
  post-quantum seal when both sides advertise keys, so `pqc.status` now
  says so. The claim is conditional on purpose: a signer without
  post-quantum support still sends classic NIP-44, and saying otherwise
  would badge an unprotected message as protected. */
export default function PostQuantumSection() {
  const t = useTranslations();
  return (
    <PageSection reveal id="post-quantum" className="border-t border-lc-border">
      <Container width="4xl" centeredText>
        <Heading as="h2" variant="section" className="mb-4">
          {t('marketing.pqc.heading')}
        </Heading>
        <Text as="p" variant="lead" className="mb-4">{t('marketing.pqc.subtitle')}</Text>
        <Text as="p" size="sm" className="text-lc-muted/80 mb-12">{t('marketing.pqc.status')}</Text>

        <Text as="p" variant="caption" className="uppercase tracking-widest mb-6">
          {t('marketing.pqc.collab')}
        </Text>
        <div className="grid sm:grid-cols-2 gap-4 text-left">
          {/* Both marks are monochrome white-on-transparent, which is the sanctioned
            on-dark treatment for each brand and keeps the pair visually consistent.
            The QuantaKrypto colour mark is not usable here: one of its nodes is
            #0E1626, which disappears against lc-black. `alt` is empty on purpose:
            the organisation name sits right beside it, so a screen reader would
            otherwise announce it twice. */}
          <Card variant="interactive" padding="2xl" asChild>
            <Link
              href="https://nostr-wot.com"
              target="_blank"
              variant="card"
            >
              <div className="flex items-center gap-3 mb-2">
                <Image src="/nostr-wot-logo.svg" alt="" aria-hidden="true" width={36} height={36} className="w-9 h-9 shrink-0" />
                <Text weight="semibold">Nostr WoT</Text>
              </div>
              <Text variant="muted" className="block">{t('marketing.pqc.nostrwot.desc')}</Text>
            </Link>
          </Card>
          <Card variant="interactive" padding="2xl" asChild>
            <Link
              href="https://quantakrypto.com"
              target="_blank"
              variant="card"
            >
              <div className="flex items-center gap-3 mb-2">
                <Image src="/quantakrypto-mark.svg" alt="" aria-hidden="true" width={36} height={36} className="w-9 h-9 shrink-0" />
                <Text weight="semibold">QuantaKrypto</Text>
              </div>
              <Text variant="muted" className="block">{t('marketing.pqc.quantakrypto.desc')}</Text>
            </Link>
          </Card>
        </div>
        <div className="mt-10">
          <Link
            href={guidePath('quantum-safe-dms')}
            variant="button" buttonVariant="pillSecondary" size="sm" className="inline-flex items-center gap-2"
          >
            {t('marketing.pqc.guide')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </Container>
    </PageSection>
  );
}
