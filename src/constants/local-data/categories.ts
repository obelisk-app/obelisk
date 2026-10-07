/**
 * Local data: categories. Values the code in
 * `services/local-data/categories.ts` reads, kept here so every reader imports
 * the one copy.
 */

import type { LocalDataCategory } from '@/services/local-data/categories';

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
