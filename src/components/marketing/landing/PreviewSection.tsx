import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from '@/components/ui/navigation/Link';
import Reveal from '@/components/ui/animations/Reveal';
import { LogInIcon } from '@/assets/icons';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

type Device = 'desktop' | 'mobile';

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

function TourTile({ device }: { device: Device }) {
  const t = useTranslations();
  return (
    <Card variant="interactive" padding="none" asChild>
      <Link
        href={`/${device}`}
        variant="card"
        className="group flex flex-col overflow-hidden"
        data-testid={`landing-preview-${device}`}
      >
        <div className="relative h-64 sm:h-72 overflow-hidden border-b border-lc-border bg-[radial-gradient(ellipse_at_50%_115%,rgba(180,249,83,0.18)_0%,rgba(180,249,83,0.04)_45%,transparent_70%)]">
          {device === 'desktop' ? (
            <figure className="absolute left-8 top-10 w-[125%] sm:w-[118%] overflow-hidden rounded-t-xl border border-b-0 border-lc-border bg-lc-dark shadow-2xl shadow-black/60 transition-transform duration-500 ease-out group-hover:-translate-y-2">
              <div aria-hidden="true" className="flex items-center gap-1.5 border-b border-lc-border bg-lc-black px-3 py-2">
                <span className="size-2 rounded-full bg-lc-border" />
                <span className="size-2 rounded-full bg-lc-border" />
                <span className="size-2 rounded-full bg-lc-border" />
              </div>
              <Image
                src="/pictures-for-posts/desktop-channel-chat.png"
                alt={t(`marketing.landing.preview.${device}.alt`)}
                width={1470}
                height={799}
                className="block h-auto w-full"
                sizes="(max-width: 768px) 110vw, 640px"
              />
            </figure>
          ) : (
            <figure className="absolute left-1/2 top-10 w-48 sm:w-52 -translate-x-1/2 overflow-hidden rounded-t-[2rem] border-[6px] border-b-0 border-lc-dark bg-lc-black shadow-2xl shadow-black/60 ring-1 ring-lc-green/20 transition-transform duration-500 ease-out group-hover:-translate-y-2">
              <span aria-hidden="true" className="absolute left-1/2 top-1.5 z-10 h-1 w-12 -translate-x-1/2 rounded-full bg-lc-black/90" />
              <Image
                src="/pictures-for-posts/mobile-channel-chat.png"
                alt={t(`marketing.landing.preview.${device}.alt`)}
                width={720}
                height={1600}
                className="block h-auto w-full"
                sizes="210px"
              />
            </figure>
          )}
        </div>
        <div className="flex flex-1 flex-col p-6 lg:p-8">
          <span className="self-start inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
            {t(`marketing.landing.preview.${device}.badge`)}
          </span>
          <Heading as="h3" className="mt-4 text-xl md:text-2xl font-bold text-lc-white">
            {t(`marketing.landing.preview.${device}.title`)}
          </Heading>
          <Text as="p" variant="muted" className="mt-2 md:text-base leading-relaxed">
            {t(`marketing.landing.preview.${device}.desc`)}
          </Text>
          <span className="mt-auto pt-6 text-sm font-semibold text-lc-green inline-flex items-center gap-2 group-hover:underline">
            {t(`marketing.landing.preview.${device}.cta`)}
            <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </span>
        </div>
      </Link>
    </Card>
  );
}
