'use client';

import { useEffect, useState } from 'react';

/**
 * A short silent screen recording, for guides that describe software you
 * cannot see from here.
 *
 * The sibling `Shot` is a still of the running app; this is the same idea
 * with motion, and the same rule applies — these are captures, not
 * illustrations. The files come out of the `obelisk-relay-shorts` project in
 * the media repo, transcoded to 720p and stripped of their audio track
 * (they never had one) before being committed under
 * `public/media-kit/video/<name>.mp4`.
 *
 * There is deliberately no player chrome. A 32-second loop that states one
 * idea is a moving illustration, not something a reader scrubs through, and
 * a progress bar invites them to treat it as a video they must finish.
 *
 * `width`/`height` are the intrinsic CSS size — half the encoded pixel
 * width, matching `Shot`'s 2x convention — so the column does not reflow
 * when the first frame arrives.
 */
export interface ClipMeta {
  alt: string;
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
    alt: 'Two commands are the whole install: ./setup.sh gives you a relay on localhost, ./expose.sh gives the world a way in — no SSH session and no YAML to hand-edit.',
  },
  'relay/ladder': {
    width: 640,
    height: 360,
    seconds: 32,
    alt: 'Admission is a ladder, not a switch: Tier 1 is added by hand, Tier 2 is two hops away in the follow graph, Tier 3 is three hops, and a block list overrides all three.',
  },
  'relay/numbers': {
    width: 640,
    height: 360,
    seconds: 32,
    alt: 'The reach of a single reference account on the public Obelisk relay: 166,735 keys admitted in total, split across Tier 1 at 1,062, Tier 2 at 45,966 and Tier 3 at 119,708 or more.',
  },
  'relay/snapshot': {
    width: 640,
    height: 360,
    seconds: 32,
    alt: 'A reported message still readable in the moderation queue after the author deleted it, because the relay captured its own copy when the report arrived.',
  },
};

export function clipPath(name: string): string {
  return `/media-kit/video/${name}.mp4`;
}

/** The poster sits with the screenshots, since that is what it is. */
export function clipPosterPath(name: string): string {
  return `/og/guides/${name.replace(/\/([^/]+)$/, '/clip-$1')}.jpg`;
}

/**
 * Autoplay is the right default for a silent loop and the wrong one for a
 * reader who has asked their OS to stop things moving. Honouring that in
 * CSS is not possible — `autoplay` is an attribute, not a style — so the
 * query is read here and the clip degrades to its poster with a play
 * control, which is the same picture plus consent.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

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
          aria-label={meta.alt}
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
            {meta.seconds}s, no sound
          </span>
        </figcaption>
      )}
    </figure>
  );
}
