import Link from '@/components/ui/navigation/Link';
import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { ExternalIcon, InstagramIcon, XLogoIcon, YouTubeIcon } from '@/assets/icons';
import { SOCIAL_ACCOUNTS, type SocialAccountId } from '@/constants/marketing/social';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

const ICONS: Record<SocialAccountId, ReactElement> = {
  instagram: <InstagramIcon size={24} />,
  youtube: <YouTubeIcon size={24} />,
  x: <XLogoIcon size={24} />,
};

/**
 * Obelisk's official social accounts: one card per network, each opening the
 * profile in a new tab.
 */
export default function SocialSection() {
  const t = useTranslations();
  return (
    <PageSection reveal id="social">
      <Container width="5xl">
        <div className="text-center mb-12">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.social.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-xl mx-auto">
            {t('marketing.social.subtitle')}
          </Text>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {SOCIAL_ACCOUNTS.map((account) => (
            <Card variant="interactive" glow padding="xl" key={account.id} asChild>
              <Link
                href={account.href}
                target="_blank"
                rel="noopener noreferrer"
                variant="card"
                className="group"
                data-testid={`landing-social-${account.id}`}
              >
                <div className="w-12 h-12 rounded-xl bg-lc-olive/30 border border-lc-green/30 flex items-center justify-center text-lc-green mb-5 group-hover:scale-105 transition-transform">
                  {ICONS[account.id]}
                </div>
                <Text as="p" variant="caption" className="mb-1">{account.network}</Text>
                <Heading as="h3" className="text-xl font-bold text-lc-green mb-4 break-all">
                  {account.handle}
                </Heading>
                <Text as="p" variant="caption" className="inline-flex items-center gap-1.5 text-lc-white group-hover:text-lc-green transition-colors">
                  {t('marketing.social.follow')}
                  <ExternalIcon size={14} />
                </Text>
              </Link>
            </Card>
          ))}
        </div>
      </Container>
    </PageSection>
  );
}
