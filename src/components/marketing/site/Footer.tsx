'use client';

import Container from '@/components/ui/layout/Container';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { guidePath } from '@/utils/guides/guide-urls';
import ObeliskIcon from '@/assets/brand/ObeliskIcon';
import TextButton from '@/components/ui/buttons/TextButton';
import { reviewAnalyticsConsent } from '@/services/analytics/consent';
import Text from '@/components/ui/layout/Text';
import Heading from '@/components/ui/layout/Heading';

export const GUIDE_SLUGS = [
  { slug: 'what-is-obelisk', tKey: 'marketing.learn.card.whatIsObelisk.title' },
  { slug: 'how-obelisk-works', tKey: 'marketing.learn.card.howObeliskWorks.title' },
  { slug: 'web-of-trust', tKey: 'marketing.learn.card.webOfTrust.title' },
  { slug: 'future-nostr-relays', tKey: 'marketing.learn.card.futureNostrRelays.title' },
] as const;

export default function Footer() {
  const t = useTranslations();

  return (
    <footer className="border-t border-lc-border/50 pt-14 pb-10 px-6" data-testid="site-footer">
      <Container width="6xl">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-3 mb-4">
              <ObeliskIcon className="w-9 h-9 text-lc-green" />
              <span className="font-extrabold text-xl text-lc-white tracking-tight">
                Obelisk
              </span>
            </Link>
            <Text as="p" variant="muted" className="leading-6 max-w-xs">
              {t('marketing.footer.brandBlurb')}
            </Text>
          </div>

          {/* Guides */}
          <nav aria-labelledby="footer-guides">
            <Heading as="h3" id="footer-guides" className="text-xs font-bold uppercase tracking-wider text-lc-white mb-4">
              {t('marketing.footer.col.guides')}
            </Heading>
            <ul className="space-y-2.5">
              {GUIDE_SLUGS.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={guidePath(g.slug)}
                    className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                  >
                    {t(g.tKey)}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={guidePath()}
                  className="text-sm text-lc-green hover:underline"
                >
                  {t('marketing.footer.allGuides')} →
                </Link>
              </li>
            </ul>
          </nav>

          {/* Product */}
          <nav aria-labelledby="footer-product">
            <Heading as="h3" id="footer-product" className="text-xs font-bold uppercase tracking-wider text-lc-white mb-4">
              {t('marketing.footer.col.product')}
            </Heading>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/app"
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                >
                  {t('marketing.footer.launchApp')}
                </Link>
              </li>
              <li>
                <Link
                  href="/#faq"
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                >
                  {t('marketing.footer.faq')}
                </Link>
              </li>
              <li>
                <Link
                  href="/help"
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                >
                  {t('marketing.footer.help')}
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/obelisk-app/obelisk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                >
                  {t('marketing.footer.github')}
                </a>
              </li>
            </ul>
          </nav>

          {/* Community */}
          <nav aria-labelledby="footer-community">
            <Heading as="h3" id="footer-community" className="text-xs font-bold uppercase tracking-wider text-lc-white mb-4">
              {t('marketing.footer.col.community')}
            </Heading>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://lacrypta.ar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                >
                  {t('marketing.footer.lacrypta')}
                </a>
              </li>
              <li>
                <a
                  href="https://nosta.me/nprofile1qqsdjkgdjkncz8sukvftuehd6ejd0clxa4tcy2ke7gf76cs0ce6gh6qpz3mhxue69uhhyetvv9ujuerpd46hxtnfduqs6amnwvaz7tmwdaejumr0dsvlpy8j"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                >
                  {t('marketing.footer.nostr')}
                </a>
              </li>
            </ul>
          </nav>

          {/* Legal */}
          <nav aria-labelledby="footer-legal">
            <Heading as="h3" id="footer-legal" className="text-xs font-bold uppercase tracking-wider text-lc-white mb-4">
              {t('marketing.footer.col.legal')}
            </Heading>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://github.com/obelisk-app/obelisk/blob/main/LICENSE"
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                >
                  {t('marketing.footer.license')}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/obelisk-app/obelisk/blob/main/ABUSE.md"
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                >
                  {t('marketing.footer.abuse')}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/obelisk-app/obelisk/blob/main/SECURITY.md"
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors"
                >
                  {t('marketing.footer.security')}
                </a>
              </li>
              <li>
                {/* Reopens the Analytics question so the answer can be changed. */}
                <TextButton
                  tone="plain"
                  className="text-left text-sm text-lc-muted transition-colors hover:text-lc-green hover:no-underline"
                  onClick={reviewAnalyticsConsent}
                  data-testid="footer-analytics-choice"
                >
                  {t('marketing.footer.analytics')}
                </TextButton>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 pt-6 border-t border-lc-border/40 flex flex-wrap items-center justify-between gap-3">
          <Text as="p" variant="caption">{t('marketing.footer.tagline')}</Text>
          <Text as="p" variant="caption">© {new Date().getFullYear()} Fabricio Acosta · AGPL-3.0</Text> {/* i18n-exempt: copyright line, a person's name and a license id */}
        </div>
      </Container>
    </footer>
  );
}
