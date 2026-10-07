import type { MessageKey } from '@/i18n/keys';
import { guidePath } from './guide-urls';

/**
 * The entry-point help topics, shared by the `/help` page and the
 * help popover in the chat top bar. One source so the two surfaces can't
 * drift; the popover exists precisely so the user doesn't have to leave
 * the chat to reach these. The copy is `help.topics.*`, in every
 * language; "view more" on both surfaces is `help.viewMore`.
 */
export interface HelpTopic {
  /** Guide slug, resolved through `guidePath(slug)`; also the topic's test id. */
  readonly slug: string;
  /** A page of its own instead of a guide (locale-free, like `/help/local-data`). */
  readonly path?: string;
  readonly titleKey: MessageKey;
  readonly descriptionKey: MessageKey;
}

/** Where a topic opens (locale-free): its own page, else its guide. */
export function helpTopicPath(topic: HelpTopic): string {
  return topic.path ?? guidePath(topic.slug);
}
