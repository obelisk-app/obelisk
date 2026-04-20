import type { Locale } from '@/i18n';
import { serializeMention } from './mentions';

export interface WelcomeTemplateVars {
  displayName: string;
  bannerUrl: string;
  serverName: string;
  pubkey?: string;
}

/**
 * Returns the markdown body of the auto-welcome message for a given locale.
 * Used both server-side (postWelcomeMessage) and client-side (admin preview),
 * so keep it pure and dependency-free.
 *
 * When `pubkey` is provided, the greeting uses a canonical `nostr:npub1<hex>`
 * mention token so MessageContent renders a clickable MentionChip. Without
 * it, we fall back to a plain `@displayName` for the admin preview.
 */
export function getWelcomeTemplate(
  locale: Locale,
  { displayName, bannerUrl, serverName, pubkey }: WelcomeTemplateVars
): string {
  const mention = pubkey ? serializeMention(pubkey) : `@${displayName}`;
  if (locale === 'en') {
    return `${mention} welcome to **${serverName}** 🥳\n\n![Welcome to ${serverName}](${bannerUrl})`;
  }
  // Spanish is the default fallback.
  return `${mention} bienvenid@ a **${serverName}** 🥳\n\n![Bienvenido/a a ${serverName}](${bannerUrl})`;
}
