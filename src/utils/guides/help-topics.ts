import type { MessageKey } from '@/i18n/keys';

/**
 * The four entry-point help topics, shared by the `/help` page and the
 * help popover in the chat top bar. One source so the two surfaces can't
 * drift; the popover exists precisely so the user doesn't have to leave
 * the chat to reach these. The copy is `help.topics.*`, in every
 * language; "view more" on both surfaces is `help.viewMore`.
 */
export interface HelpTopic {
  /** Guide slug, resolved through `guidePath(slug)`. */
  readonly slug: string;
  readonly titleKey: MessageKey;
  readonly descriptionKey: MessageKey;
}

export const HELP_TOPICS: ReadonlyArray<HelpTopic> = [
  {
    slug: 'what-is-obelisk',
    titleKey: 'help.topics.start.title',
    descriptionKey: 'help.topics.start.description',
  },
  {
    slug: 'how-obelisk-works',
    titleKey: 'help.topics.how.title',
    descriptionKey: 'help.topics.how.description',
  },
  {
    slug: 'admin-cli',
    titleKey: 'help.topics.community.title',
    descriptionKey: 'help.topics.community.description',
  },
  {
    slug: 'bitcoin-zaps',
    titleKey: 'help.topics.payments.title',
    descriptionKey: 'help.topics.payments.description',
  },
];
