/**
 * Key and translator types for code that passes `t` around or stores keys
 * in data (`labelKey: 'shell.desktop.reactions.count'`).
 */

import type { MessageKeys, Messages, NestedKeyOf, TranslationValues } from 'next-intl';

/** Any leaf key of the English messages. */
export type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;

/** What `useTranslations()` returns, narrowed to the plain call. */
export type Translate = (key: MessageKey, values?: TranslationValues) => string;
