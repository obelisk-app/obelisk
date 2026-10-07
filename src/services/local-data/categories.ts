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
import { LOCAL_DATA_CATEGORIES } from '@/constants/local-data/categories';

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

export function categoryById(id: LocalDataCategoryId): LocalDataCategory {
  const found = LOCAL_DATA_CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`local-data: no category ${id}`);
  return found;
}
