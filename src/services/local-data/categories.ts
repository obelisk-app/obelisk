/**
 * The categories a person sees, in display order, with their copy and what
 * removing one does to the page afterwards.
 *
 * The title and purpose live in the `help` module so the settings screen
 * and the `/help/local-data` page say the same thing (`/app` ships `help`
 * for the help popover already). The confirmation sentences are the
 * settings screen's own (`confirm-keys.ts`): this file is on the help
 * page's route, which does not ship `settings`.
 */
import type { MessageKey } from '@/i18n/keys';
import type { LocalDataCategoryId } from './types';

/**
 * What happens once the data is gone:
 * - `reload`: the page reloads so every store rebuilds without it;
 * - `logout`: the session is ended first, then the page reloads;
 * - `none`: nothing in memory depends on it (the offline files, the
 *   analytics cookies);
 * - `relocate`: reload on the same page without the language prefix.
 */
export type AfterRemoval = 'reload' | 'logout' | 'none' | 'relocate';

export interface LocalDataCategory {
  readonly id: LocalDataCategoryId;
  readonly titleKey: MessageKey;
  readonly purposeKey: MessageKey;
  readonly after: AfterRemoval;
}

export const LOCAL_DATA_CATEGORIES: ReadonlyArray<LocalDataCategory> = [
  {
    id: 'channels',
    titleKey: 'help.localData.categories.channels.title',
    purposeKey: 'help.localData.categories.channels.purpose',
    after: 'reload',
  },
  {
    id: 'profiles',
    titleKey: 'help.localData.categories.profiles.title',
    purposeKey: 'help.localData.categories.profiles.purpose',
    after: 'reload',
  },
  {
    id: 'readState',
    titleKey: 'help.localData.categories.readState.title',
    purposeKey: 'help.localData.categories.readState.purpose',
    after: 'reload',
  },
  {
    id: 'dmMessages',
    titleKey: 'help.localData.categories.dmMessages.title',
    purposeKey: 'help.localData.categories.dmMessages.purpose',
    after: 'reload',
  },
  {
    id: 'dms',
    titleKey: 'help.localData.categories.dms.title',
    purposeKey: 'help.localData.categories.dms.purpose',
    after: 'reload',
  },
  {
    id: 'preferences',
    titleKey: 'help.localData.categories.preferences.title',
    purposeKey: 'help.localData.categories.preferences.purpose',
    after: 'reload',
  },
  {
    id: 'personal',
    titleKey: 'help.localData.categories.personal.title',
    purposeKey: 'help.localData.categories.personal.purpose',
    after: 'reload',
  },
  {
    id: 'login',
    titleKey: 'help.localData.categories.login.title',
    purposeKey: 'help.localData.categories.login.purpose',
    after: 'logout',
  },
  {
    id: 'wallet',
    titleKey: 'help.localData.categories.wallet.title',
    purposeKey: 'help.localData.categories.wallet.purpose',
    after: 'reload',
  },
  {
    id: 'offline',
    titleKey: 'help.localData.categories.offline.title',
    purposeKey: 'help.localData.categories.offline.purpose',
    after: 'none',
  },
  {
    id: 'language',
    titleKey: 'help.localData.categories.language.title',
    purposeKey: 'help.localData.categories.language.purpose',
    after: 'relocate',
  },
  {
    id: 'analytics',
    titleKey: 'help.localData.categories.analytics.title',
    purposeKey: 'help.localData.categories.analytics.purpose',
    after: 'none',
  },
];

export function categoryById(id: LocalDataCategoryId): LocalDataCategory {
  const found = LOCAL_DATA_CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`local-data: no category ${id}`);
  return found;
}
