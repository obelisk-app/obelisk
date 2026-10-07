import type { ComponentType } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { snapshotPaths, type GuideAssetMeta } from '@/utils/guides/asset-meta';

/**
 * A drawing as search engines and readers both get it: the still frame
 * (`public/og/guides/`) as a real `<img>` with its alt text, and the live
 * animated drawing laid over it.
 */
export default function IndexableSvg({
  name,
  Component,
  meta,
}: {
  name: string;
  Component: ComponentType;
  meta: GuideAssetMeta;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const paths = snapshotPaths(name, locale);
  return (
    <div className="relative w-full">
      {/* Plain <img>: hidden under the live <svg>, exists only as the indexable asset; next/image would re-encode lossily. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={paths.png}
        alt={t(meta.altKey)}
        width={meta.width}
        height={meta.height}
        className="block w-full h-auto"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0" aria-hidden="true">
        <Component />
      </div>
    </div>
  );
}
