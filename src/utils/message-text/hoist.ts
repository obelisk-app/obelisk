/**
 * The parts of a message that render below the text instead of inside it:
 * media URLs, the welcome banner, BOLT11 invoices and game markers. Each
 * finder is pure; `useMessageBody` memoises them and strips what they found
 * from the markdown body.
 */
import { isImageUrl, extractYouTubeId, extractUrls } from '@/utils/message-text/markdown';
import { isVideoUrl, isAudioUrl } from '@/utils/attachments/attachments';
import { isSameOriginMediaUrl } from '@/services/media/remote-media';
import { INVOICE_REGEX } from '@/utils/wallet/bolt11';
import { GAME_MARKER_REGEX } from '@/lib/games/protocol/protocol';

export interface HoistedUrls {
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
  youtubeUrls: string[];
  linkUrls: string[];
}

export interface WelcomeBannerMatch {
  alt: string;
  src: string;
  raw: string;
}

/**
 * Sort every URL in the message by how it renders. Whatever is not media is
 * an ordinary link to unfurl: capped at the first two so a wall of links
 * cannot turn one message into a page of cards, and deduplicated so the
 * same link posted twice unfurls once. A voice note hoists nothing.
 */
export function hoistUrls(content: string, hasVoiceNote: boolean): HoistedUrls {
  const urls = hasVoiceNote ? [] : extractUrls(content);
  const images = urls.filter(isImageUrl);
  const videos = urls.filter(isVideoUrl);
  const audio = urls.filter(isAudioUrl);
  const youtube = urls.filter((u) => !!extractYouTubeId(u));
  // Media already renders as itself, so previewing it again would just
  // duplicate the message.
  const claimed = new Set([...images, ...videos, ...audio, ...youtube]);
  const links = [...new Set(urls.filter((u) => !claimed.has(u)))].slice(0, 2);
  return {
    imageUrls: images,
    videoUrls: videos,
    audioUrls: audio,
    youtubeUrls: youtube,
    linkUrls: links,
  };
}

// Matches `![alt](url)` when the url points at /api/welcome-banner. We detect
// this before markdown parsing so the banner can be hoisted out and rendered
// by <WelcomeBanner> (with animated stars) instead of a generic <img>.
const WELCOME_BANNER_MD_REGEX = /!\[([^\]]*)\]\(([^)\s]*\/api\/welcome-banner[^)\s]*)\)/;

/**
 * The welcome bot's banner image. Relative URLs don't match `extractUrls`
 * (which requires http(s)://), so the generic strip pipeline misses it and
 * it is parsed out here.
 */
export function findWelcomeBanner(content: string): WelcomeBannerMatch | null {
  const m = content.match(WELCOME_BANNER_MD_REGEX);
  if (!m) return null;
  // Only our own route gets the banner treatment. A remote URL that merely
  // contains `/api/welcome-banner` is sender-chosen media like any other
  // and must not slip past the remote-media gate.
  if (!isSameOriginMediaUrl(m[2])) return null;
  return { alt: m[1], src: m[2], raw: m[0] };
}

/** BOLT11 invoices in the message, each once (case-insensitive). */
export function findInvoices(content: string): string[] {
  const matches = content.match(INVOICE_REGEX) || [];
  const seen = new Set<string>();
  return matches.filter((m) => { const k = m.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The markdown body left once everything hoisted has been cut out of it. */
export function stripHoisted(
  content: string,
  hoisted: {
    urls: ReadonlyArray<string>;
    welcomeBanner: WelcomeBannerMatch | null;
    invoices: ReadonlyArray<string>;
    hasGames: boolean;
  },
): string {
  let stripped = content;
  if (hoisted.welcomeBanner) stripped = stripped.split(hoisted.welcomeBanner.raw).join('');
  for (const url of hoisted.urls) {
    stripped = stripped.split(url).join('');
  }
  for (const inv of hoisted.invoices) {
    stripped = stripped.split(inv).join('');
  }
  if (hoisted.hasGames) stripped = stripped.replace(GAME_MARKER_REGEX, '');
  // collapse stray whitespace/newlines left behind
  return stripped.replace(/\n{3,}/g, '\n\n').trim();
}
