/**
 * Where a guide clip and its poster live under `public/`. The files come out
 * of the `obelisk-relay-shorts` project in the media repo and are committed
 * by hand, so these builders are the one place the layout is spelled out.
 */

export function clipPath(name: string): string {
  return `/media-kit/video/${name}.mp4`;
}

/** The poster sits with the screenshots, since that is what it is. */
export function clipPosterPath(name: string): string {
  return `/og/guides/${name.replace(/\/([^/]+)$/, '/clip-$1')}.jpg`;
}
