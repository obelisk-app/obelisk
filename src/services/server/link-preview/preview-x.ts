/**
 * x.com is special-cased because it has to be. Measured against the live site:
 * it serves NO OpenGraph or twitter: meta at all, not even to a bot
 * user-agent, no title, no description, no image. Generic scraping cannot
 * ever produce an x.com preview, which is why they were blank. Its oEmbed
 * endpoint does work, needs no API key, and returns the post text and author,
 * so links to X resolve through that instead (after the richer syndication
 * endpoint, when the URL carries a post id).
 *
 * Both endpoints are fixed X hosts, not the user's URL, so they are fetched
 * directly rather than through `safeFetch`.
 */

import { decodeEntities, syndicationToken, tweetIdFrom, type LinkPreview } from '@/utils/link-preview';
import { FETCH_TIMEOUT_MS, UA } from './safe-fetch';

interface SyndicationMedia {
  media_url_https?: string;
  type?: string;
}

async function previewXSyndication(url: string, id: string): Promise<LinkPreview | null> {
  const endpoint =
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}` +
    `&token=${syndicationToken(id)}&lang=en`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, headers: { 'user-agent': UA } });
    if (!response.ok) return null;
    // A deleted or protected post answers with an HTML error page, not JSON.
    if (!(response.headers.get('content-type') ?? '').includes('json')) return null;

    const data = (await response.json()) as {
      text?: string;
      user?: { name?: string; screen_name?: string };
      mediaDetails?: SyndicationMedia[];
      photos?: { url?: string }[];
    };
    if (!data.text && !data.user?.name) return null;

    const media =
      data.mediaDetails?.find((m) => m.media_url_https)?.media_url_https ??
      data.photos?.find((p) => p.url)?.url;

    // Only https, and only from their media host: this URL goes straight into
    // an <img> src, so it must not be a redirect to somewhere arbitrary.
    let image: string | undefined;
    if (media) {
      try {
        const parsed = new URL(media);
        if (parsed.protocol === 'https:' && /(^|\.)twimg\.com$/.test(parsed.hostname)) {
          image = parsed.toString();
        }
      } catch {
        image = undefined;
      }
    }

    const handle = data.user?.screen_name ? `@${data.user.screen_name}` : undefined;
    const name = data.user?.name ?? handle;

    // No English glue ("on X", "Post"): the card already labels itself with
    // the site name, and this response is cached for every reader's language.
    return {
      url,
      kind: 'post',
      title: name && handle && name !== handle ? `${name} (${handle})` : name,
      description: data.text?.trim().slice(0, 400) || undefined,
      image,
      siteName: 'X',
      author: data.user?.name,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function previewXOembed(url: string): Promise<LinkPreview | null> {
  const endpoint = `https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(url)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, headers: { 'user-agent': UA } });
    if (!response.ok) return null;
    const data = (await response.json()) as { html?: string; author_name?: string; provider_name?: string };
    if (!data.html) return null;

    // The payload is a <blockquote> of markup. Take the text, not the HTML:
    // this is untrusted third-party content and is rendered as a plain card.
    const text = decodeEntities(
      data.html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' '),
    ).trim();

    // oEmbed appends "Author (@handle) March 21, 2006" to the post text.
    // The author is already the title, so drop it rather than saying it twice.
    const body = text.replace(/\s*\u2014\s*[^\u2014]*\(@[^)]+\)\s+\w+ \d{1,2}, \d{4}\s*$/u, '').trim();

    return {
      url,
      kind: 'post',
      title: data.author_name || undefined,
      description: (body || text).slice(0, 400) || undefined,
      siteName: data.provider_name ?? 'X',
      author: data.author_name,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function previewX(url: string, parsed: URL): Promise<LinkPreview | null> {
  const id = tweetIdFrom(parsed);
  if (id) {
    const rich = await previewXSyndication(url, id);
    if (rich) return rich;
  }
  return previewXOembed(url);
}
