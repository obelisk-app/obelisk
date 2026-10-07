/**
 * Guides: help topics. Values the code in `utils/guides/help-topics.ts` reads,
 * kept here so every reader imports the one copy.
 */

import type { HelpTopic } from '@/utils/guides/help-topics';

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
  {
    slug: 'local-data',
    path: '/help/local-data',
    titleKey: 'help.topics.localData.title',
    descriptionKey: 'help.topics.localData.description',
  },
];
