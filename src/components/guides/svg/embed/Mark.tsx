import { useLocale, useTranslations } from 'next-intl';
import { DIAGRAM_ASSET_META, snapshotPaths } from '@/utils/guides/asset-meta';
import { DIAGRAM_REGISTRY } from '../index';

/** A project's logo mark, inline in a line of text, over its indexable still frame. */
export default function Mark({ name, size = 40 }: { name: string; size?: number }) {
  const t = useTranslations();
  const locale = useLocale();
  const C = DIAGRAM_REGISTRY[name];
  const meta = DIAGRAM_ASSET_META[name];
  if (!C || !meta) return null;
  const paths = snapshotPaths(name, locale);
  return (
    <span
      className="relative inline-block align-middle mr-2 rounded-md overflow-hidden border border-lc-border bg-lc-dark"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={paths.png}
        alt={t(meta.altKey)}
        width={size}
        height={size}
        className="block w-full h-full"
        loading="lazy"
        decoding="async"
      />
      <span className="absolute inset-0" aria-hidden="true">
        <C />
      </span>
    </span>
  );
}
