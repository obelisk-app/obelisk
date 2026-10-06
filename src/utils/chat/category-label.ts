import type { Translate } from '@/i18n/keys';

/**
 * A layout category's name as a reader sees it. The layout event can carry
 * an empty name; the parsed layout (and its cache) keeps it empty, and the
 * fallback is named here, at render time, so switching language renames it
 * too and nothing ever writes a translated placeholder back to the relay.
 */
export function categoryLabel(name: string, t: Translate): string {
  return name.trim() || t('shell.channel.untitledCategory');
}
