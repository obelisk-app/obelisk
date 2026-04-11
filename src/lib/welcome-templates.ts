import type { Locale } from '@/i18n';

export interface WelcomeTemplateVars {
  displayName: string;
  bannerUrl: string;
  serverName: string;
}

/**
 * Returns the markdown body of the auto-welcome message for a given locale.
 * Used both server-side (postWelcomeMessage) and client-side (admin preview),
 * so keep it pure and dependency-free.
 */
export function getWelcomeTemplate(
  locale: Locale,
  { displayName, bannerUrl, serverName }: WelcomeTemplateVars
): string {
  if (locale === 'en') {
    return `**@${displayName}** welcome to **${serverName}** 🥳\n\n![Welcome to ${serverName}](${bannerUrl})`;
  }
  // Spanish is the default fallback.
  return `**@${displayName}** bienvenid@ a **${serverName}** 🥳\n\n![Bienvenido/a a ${serverName}](${bannerUrl})`;
}
