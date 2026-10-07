/**
 * The text of each preview card, in the URL's language: site pages from
 * their `seo` copy, and the relay-content viewers (a note, a profile, a
 * hashtag) from the relays, cut to fit. When the relays do not answer, the
 * card still renders with what the URL says, so a preview never breaks.
 */

import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n';
import type { MessageKey } from '@/i18n/keys';
import { parseIdentifier } from '@/services/social/identifier';
import { displayNameFor, fetchAuthorForViewer, fetchEventForViewer } from '@/services/server/viewer/nostr-fetch';
import { buildNotePreview } from '@/services/server/viewer/note-preview';
import { cardFooter, type OgCardProps, type PageCard } from '@/utils/seo/cards';
import { PAGE_CARDS } from '@/constants/seo/cards';
import { excerpt } from '@/utils/seo/og';
import { hashtagFromSegment } from '@/utils/social/hashtag-segment';

async function setup(raw: string) {
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return { locale, t: await getTranslations({ locale }) };
}

export async function pageCard(raw: string, page: PageCard): Promise<OgCardProps> {
  const { locale, t } = await setup(raw);
  const { copy, path } = PAGE_CARDS[page];
  return {
    label: t(`seo.card.label.${page}` as MessageKey),
    title: t(`seo.${copy}.title` as MessageKey),
    subtitle: t(`seo.${copy}.description` as MessageKey),
    footer: cardFooter(locale, path),
    icon: page,
  };
}

export async function noteCard(raw: string, id: string): Promise<OgCardProps> {
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
  return {
    label: t('seo.card.label.note'),
    title: excerpt(preview?.title ?? t('seo.notes.notFound'), 90),
    subtitle: excerpt(preview?.description ?? '', 170),
    footer: cardFooter(locale, '/notes'),
    icon: 'note',
  };
}

export async function profileCard(raw: string, id: string): Promise<OgCardProps> {
  const { locale, t } = await setup(raw);
  const target = parseIdentifier(id);
  const profile = target?.kind === 'profile' ? await fetchAuthorForViewer(target.pubkey).catch(() => null) : null;
  const name = profile ? displayNameFor(profile) : t('seo.profile.notFound');
  return {
    label: t('seo.card.label.profile'),
    title: excerpt(name, 60),
    subtitle: excerpt(profile?.about?.trim() || t('seo.profile.onNostr', { name }), 170),
    footer: cardFooter(locale, '/p'),
    icon: 'profile',
  };
}

export async function tagCard(raw: string, segment: string): Promise<OgCardProps> {
  const { locale, t } = await setup(raw);
  const tag = hashtagFromSegment(segment) ?? '';
  return {
    label: t('seo.card.label.tag'),
    title: `#${tag}`,
    subtitle: t('seo.tag.description', { tag }),
    footer: cardFooter(locale, `/t/${encodeURIComponent(tag)}`),
    icon: 'tag',
  };
}
