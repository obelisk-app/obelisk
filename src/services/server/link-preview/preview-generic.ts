/** OpenGraph / twitter: / <title> unfurl of an ordinary page, fetched through `safeFetch`. */

import { decodeEntities, readMeta, type LinkPreview } from '@/utils/link-preview';
import { safeFetch } from './safe-fetch';

export async function previewGeneric(url: string): Promise<LinkPreview | null> {
  const fetched = await safeFetch(url);
  if (!fetched) return null;
  const { body, finalUrl } = fetched;

  const title =
    readMeta(body, 'og:title') ??
    readMeta(body, 'twitter:title') ??
    body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();

  const description = readMeta(body, 'og:description') ?? readMeta(body, 'twitter:description');
  const rawImage = readMeta(body, 'og:image') ?? readMeta(body, 'twitter:image');

  let image: string | undefined;
  if (rawImage) {
    try {
      const absolute = new URL(rawImage, finalUrl);
      // Only https: an http image on an https page is a mixed-content block.
      if (absolute.protocol === 'https:') image = absolute.toString();
    } catch {
      image = undefined;
    }
  }

  if (!title && !description && !image) return null;

  return {
    url: finalUrl,
    kind: 'link',
    title: title ? decodeEntities(title).slice(0, 200) : undefined,
    description: description?.slice(0, 400),
    image,
    siteName: readMeta(body, 'og:site_name') ?? new URL(finalUrl).hostname.replace(/^www\./, ''),
  };
}
