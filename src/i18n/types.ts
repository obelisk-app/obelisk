/**
 * Typed keys: English is the source of truth. `t('chat.composer.send')` is
 * checked against `messages/en/*.json`; `tests/i18n/locales.test.ts` checks
 * that es and pt have exactly the same keys and ICU arguments.
 */

import type common from './messages/en/common.json';
import type seo from './messages/en/seo.json';
import type marketing from './messages/en/marketing.json';
import type showcase from './messages/en/showcase.json';
import type shell from './messages/en/shell.json';
import type mobile from './messages/en/mobile.json';
import type chat from './messages/en/chat.json';
import type dm from './messages/en/dm.json';
import type calls from './messages/en/calls.json';
import type social from './messages/en/social.json';
import type settings from './messages/en/settings.json';
import type media from './messages/en/media.json';
import type games from './messages/en/games.json';
import type voice from './messages/en/voice.json';
import type admin from './messages/en/admin.json';
import type guides from './messages/en/guides.json';
import type help from './messages/en/help.json';
import type mediaKit from './messages/en/mediaKit.json';
import type errors from './messages/en/errors.json';
import type { Locale } from './index';

export type AppMessages = {
  common: typeof common;
  seo: typeof seo;
  marketing: typeof marketing;
  showcase: typeof showcase;
  shell: typeof shell;
  mobile: typeof mobile;
  chat: typeof chat;
  dm: typeof dm;
  calls: typeof calls;
  social: typeof social;
  settings: typeof settings;
  media: typeof media;
  games: typeof games;
  voice: typeof voice;
  admin: typeof admin;
  guides: typeof guides;
  help: typeof help;
  mediaKit: typeof mediaKit;
  errors: typeof errors;
};

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: AppMessages;
  }
}
