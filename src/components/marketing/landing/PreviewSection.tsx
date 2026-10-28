import Container from '@/components/ui/layout/Container';
import { useTranslations } from 'next-intl';
import Link from '@/components/ui/navigation/Link';
import Reveal from '@/components/ui/animations/Reveal';
import { LogInIcon } from '@/assets/icons';
import TourTile from './TourTile';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * Product preview: one tile per device, side by side on md+, each linking to
 * its tour page (/desktop and /mobile). The top of a tile is a lit stage the
 * real screenshot rises out of (a browser window, a phone), cropped by the
 * stage's bottom edge so both tiles keep the same height; the copy sits
 * below. The CTA under them bounces visitors straight into /app.
 */
export default function PreviewSection() {
  const t = useTranslations();
  return (
    <Reveal id="preview" className="pt-12 pb-16 px-6">
      <Container width="6xl">
        <div className="text-center mb-12">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.landing.preview.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-2xl mx-auto">
            {t('marketing.landing.preview.subtitle')}
          </Text>
        </div>

        <Container width="5xl" className="grid gap-6 md:grid-cols-2">
          {(['desktop', 'mobile'] as const).map((device) => (
            <TourTile key={device} device={device} />
          ))}
        </Container>

        <div className="mt-10 flex justify-center">
          <Link href="/app" prefetch={false} variant="button" buttonVariant="pill" size="lg">
            <LogInIcon size={18} strokeWidth={2.5} />
            {t('marketing.hero.launchApp')}
          </Link>
        </div>
      </Container>
    </Reveal>
  );
}
