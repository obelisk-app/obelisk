/**
 * The text of each live preview card, in the URL's language: the
 * relay-content viewers (a note, a profile, a hashtag) from the relays, cut
 * to fit, and a relay share link from its code. When the relays do not
 * answer, the card still renders with what the URL says, so a preview never
 * breaks, and says so (`found: false`), so it is not cached for long. The site pages' cards are drawn ahead of time from their `seo`
 * copy (`pageCardProps`, `npm run snap-og`).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n';
import { parseIdentifier } from '@/services/social/identifier';
import { displayNameFor, fetchAuthorForViewer, fetchEventForViewer, type ViewerProfile } from '@/services/server/viewer/nostr-fetch';
import { buildNotePreview } from '@/services/server/viewer/note-preview';
import { cardFooter, type LiveCard, type OgCardProps, type RelayCardProps } from '@/utils/seo/cards';
import { BRANDED_RELAYS } from '@/constants/seo/relay';
import { decodeRelayShareCode } from '@/utils/relay-url/relay-share-link';
import { excerpt } from '@/utils/seo/og';
import { hashtagFromSegment } from '@/utils/social/hashtag-segment';

/** The relays returned a profile with something in it (an empty one is what a miss parses to). */
function known(profile: ViewerProfile | null): boolean {
  return Boolean(profile && (profile.name || profile.displayName || profile.about || profile.picture));
}

async function setup(raw: string) {
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return { locale, t: await getTranslations({ locale }) };
}

export async function noteCard(raw: string, id: string): Promise<LiveCard<OgCardProps>> {
  const { locale, t } = await setup(raw);
  const target = parseIdentifier(id);
  const note = target ? await fetchEventForViewer(target).catch(() => null) : null;
  const author = note ? await fetchAuthorForViewer(note.pubkey).catch(() => null) : null;
  const preview = note
    ? buildNotePreview(note, author ? displayNameFor(author) : '', {
      noteTitle: (name) => t('seo.notes.title', { name }),
      untitledArticle: t('seo.notes.untitledArticle'),
      sharedMedia: t('seo.notes.sharedMedia'),
    })
    : null;
  const props: OgCardProps = {
    label: t('seo.card.label.note'),
    title: excerpt(preview?.title ?? t('seo.notes.notFound'), 90),
    subtitle: excerpt(preview?.description ?? '', 170),
    footer: cardFooter(locale, '/notes'),
    icon: 'note',
  };
  return { props, found: Boolean(note) && known(author) };
}

export async function profileCard(raw: string, id: string): Promise<LiveCard<OgCardProps>> {
  const { locale, t } = await setup(raw);
  const target = parseIdentifier(id);
  const profile = target?.kind === 'profile' ? await fetchAuthorForViewer(target.pubkey).catch(() => null) : null;
  const name = profile ? displayNameFor(profile) : t('seo.profile.notFound');
  const props: OgCardProps = {
    label: t('seo.card.label.profile'),
    title: excerpt(name, 60),
    subtitle: excerpt(profile?.about?.trim() || t('seo.profile.onNostr', { name }), 170),
    footer: cardFooter(locale, '/p'),
    icon: 'profile',
  };
  return { props, found: known(profile) };
}

/** A hashtag's card needs no relay: it is always complete. */
export async function tagCard(raw: string, segment: string): Promise<LiveCard<OgCardProps>> {
  const { locale, t } = await setup(raw);
  const tag = hashtagFromSegment(segment) ?? '';
  const props: OgCardProps = {
    label: t('seo.card.label.tag'),
    title: `#${tag}`,
    subtitle: t('seo.tag.description', { tag }),
    footer: cardFooter(locale, `/t/${encodeURIComponent(tag)}`),
    icon: 'tag',
  };
  return { props, found: true };
}

/** A relay share link's card: a branded relay's name, line and logo, else the generic relay card. */
export async function relayCard(raw: string, code: string): Promise<LiveCard<RelayCardProps>> {
  const { t } = await setup(raw);
  const relayUrl = decodeRelayShareCode(code);
  const brand = relayUrl ? BRANDED_RELAYS[relayUrl] : undefined;
  const logo = brand ? await logoDataUri(brand.logoFile) : null;
  const props: RelayCardProps = {
    title: brand?.name ?? t('seo.relay.fallbackTitle'),
    subtitle: brand ? t(`seo.relay.${brand.key}.ogSubtitle`) : t('seo.relay.fallbackSubtitle'),
    tagline: t('seo.relay.ogTagline'),
    logo,
  };
  // A branded relay whose logo could not be read is not the finished card.
  return { props, found: !brand || logo !== null };
}

/** A logo under `public/` as a data URI the image renderer can draw; none when it cannot be read. */
async function logoDataUri(file: string): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', file));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
