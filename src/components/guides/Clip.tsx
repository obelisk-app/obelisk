'use client';

import { useTranslations } from 'next-intl';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { MessageKey } from '@/i18n/keys';
import { clipPath, clipPosterPath } from '@/utils/guides/clip-paths';

/**
 * A short silent screen recording, for guides that describe software you
 * cannot see from here.
 *
 * The sibling `Shot` is a still of the running app; this is the same idea
 * with motion, and the same rule applies - these are captures, not
 * illustrations. The files come out of the `obelisk-relay-shorts` project in
 * the media repo, transcoded to 720p and stripped of their audio track
 * (they never had one) before being committed under
 * `public/media-kit/video/<name>.mp4`.
 *
 * There is deliberately no player chrome. A 32-second loop that states one
 * idea is a moving illustration, not something a reader scrubs through, and
 * a progress bar invites them to treat it as a video they must finish.
 *
 * `width`/`height` are the intrinsic CSS size - half the encoded pixel
 * width, matching `Shot`'s 2x convention - so the column does not reflow
 * when the first frame arrives.
 */
export interface ClipMeta {
  /** The description, read as the video's label: `guides.clip.alt.*`. */
  altKey: MessageKey;
  width: number;
  height: number;
  /** Runtime, for the "N seconds, no sound" affordance under the frame. */
  seconds: number;
}

export const CLIP_META: Record<string, ClipMeta> = {
  'relay/install': {
    width: 640,
    height: 360,
    seconds: 32,
    altKey: 'guides.clip.alt.relayInstall',
  },
  'relay/ladder': {
    width: 640,
    height: 360,
    seconds: 32,
    altKey: 'guides.clip.alt.relayLadder',
  },
  'relay/numbers': {
    width: 640,
    height: 360,
    seconds: 32,
    altKey: 'guides.clip.alt.relayNumbers',
  },
  'relay/snapshot': {
    width: 640,
    height: 360,
    seconds: 32,
    altKey: 'guides.clip.alt.relaySnapshot',
  },
};

/**
 * Autoplay is the right default for a silent loop and the wrong one for a
 * reader who has asked their OS to stop things moving. Honouring that in
 * CSS is not possible, `autoplay` is an attribute, not a style, so the
 * query is read here and the clip degrades to its poster with a play
 * control, which is the same picture plus consent.
 */
export default function Clip({
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
  const reduced = usePrefersReducedMotion();
  const meta = CLIP_META[name];
  if (!meta) return null;
  return (
    <figure className="my-8 w-full" data-testid={`clip-${name}`}>
      <div className="w-full overflow-hidden rounded-xl border border-lc-border bg-lc-dark">
        <video
          src={clipPath(name)}
          poster={clipPosterPath(name)}
          width={meta.width}
          height={meta.height}
          aria-label={t(meta.altKey)}
          className="mx-auto block h-auto w-full"
          style={maxWidth ? { maxWidth } : undefined}
          preload="metadata"
          playsInline
          muted
          loop={!reduced}
          autoPlay={!reduced}
          controls={reduced}
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-lc-muted">
          {caption}
          <span className="ml-1.5 text-lc-muted/60">
            {t('guides.clip.duration', { seconds: meta.seconds })}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
