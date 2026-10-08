import List from '@/components/ui/layout/List';
import Card from '@/components/ui/layout/Card';
import Image from 'next/image';
import { CheckIcon } from '@/assets/icons';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import Reveal from '@/components/ui/animations/Reveal';

export type ShowcaseItem = {
  src: string;
  alt: string;
  width: number;
  height: number;
  badge: string;
  title: string;
  description: string;
  features: string[];
  orientation: 'portrait' | 'landscape';
  priority?: boolean;
};

export function ShowcaseRow({ item, index }: { item: ShowcaseItem; index: number }) {
  const isPortrait = item.orientation === 'portrait';
  const reverse = index % 2 === 1;

  return (
    <Reveal
      as="article"
      className="relative"
      itemScope
      itemType="https://schema.org/ImageObject"
    >
      <div
        className={`grid items-center gap-10 lg:gap-16 ${
          isPortrait
            ? 'lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]'
            : 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'
        }`}
      >
        <figure
          className={`mx-auto w-full ${reverse ? 'lg:order-2' : ''} ${
            isPortrait ? 'max-w-sm' : 'max-w-3xl'
          }`}
        >
          <Card
            padding="none"
            radius="2xl"
            style={isPortrait ? { borderRadius: '2.25rem' } : undefined}
            className="relative overflow-hidden shadow-[0_40px_120px_-40px_rgba(180,249,83,0.18)]"
          >
            <Image
              src={item.src}
              alt={item.alt}
              width={item.width}
              height={item.height}
              className="w-full h-auto block"
              sizes={
                isPortrait
                  ? '(max-width: 1024px) 80vw, 360px'
                  : '(max-width: 1024px) 90vw, 720px'
              }
              priority={item.priority}
              itemProp="contentUrl"
            />
          </Card>
          <figcaption className="sr-only" itemProp="description">
            {item.alt}
          </figcaption>
        </figure>

        <div className="px-1">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
            {item.badge}
          </span>
          <Heading as="h2" variant="article" className="mt-4 md:text-3xl lg:text-4xl leading-tight" itemProp="name">
            {item.title}
          </Heading>
          <Text as="p" size="base" tone="muted" className="mt-4 md:text-lg leading-relaxed">
            {item.description}
          </Text>
          {item.features.length > 0 && (
            <List marker="none" spacing="relaxed" className="mt-6">
              {item.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm md:text-base text-lc-muted">
                  <CheckIcon size={18} strokeWidth={2.5} className="text-lc-green mt-1 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </List>
          )}
        </div>
      </div>
    </Reveal>
  );
}
