/**
 * The sentence the settings screen shows before removing each category:
 * what will happen, in one breath. Kept apart from `categories.ts` because
 * these keys live in the `settings` module, which the help page's route
 * does not ship.
 */
import type { MessageKey } from '@/i18n/keys';
import type { LocalDataCategoryId } from '@/services/local-data/types';

export const CONFIRM_KEYS: Record<LocalDataCategoryId, MessageKey> = {
  channels: 'settings.localData.confirm.channels',
  profiles: 'settings.localData.confirm.profiles',
  readState: 'settings.localData.confirm.readState',
  dmMessages: 'settings.localData.confirm.dmMessages',
  dms: 'settings.localData.confirm.dms',
  preferences: 'settings.localData.confirm.preferences',
  personal: 'settings.localData.confirm.personal',
  login: 'settings.localData.confirm.login',
  wallet: 'settings.localData.confirm.wallet',
  offline: 'settings.localData.confirm.offline',
  language: 'settings.localData.confirm.language',
  analytics: 'settings.localData.confirm.analytics',
};
