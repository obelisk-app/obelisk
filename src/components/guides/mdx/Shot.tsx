import { useTranslations } from 'next-intl';
import { SHOT_META, shotPath } from '@/utils/guides/shots';

/**
 * A screenshot of the running app in a guide: one of `SHOT_META`
 * (`src/utils/guides/shots.ts`, where the shots and where they come from
 * are described), at its intrinsic size, with its translated alt text.
 */
export default function Shot({
  name,
  caption,
  /** Cap the rendered width; the natural size is often wider than the column. */
  maxWidth,
}: {
  name: string;
  caption?: string;
  maxWidth?: number;
}) {
  const t = useTranslations();
  const meta = SHOT_META[name];
  if (!meta) return null;
  return (
    <figure className="my-8 w-full" data-testid={`shot-${name}`}>
      <div className="w-full overflow-hidden rounded-xl border border-lc-border bg-lc-dark">
        {/* Plain <img>: these are already the exact pixels we want, and
            next/image would re-encode a screenshot of a dark UI badly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shotPath(name)}
          alt={t(meta.altKey)}
          width={meta.width}
          height={meta.height}
          className="mx-auto block h-auto w-full"
          style={maxWidth ? { maxWidth } : undefined}
          loading="lazy"
          decoding="async"
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-lc-muted">{caption}</figcaption>
      )}
    </figure>
  );
}
