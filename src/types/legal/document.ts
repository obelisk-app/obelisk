/**
 * The shape of a legal page (`/privacy`, `/terms`, `/support`): a title, the
 * date it was last changed, an introduction and a list of sections. Every
 * sentence is a message key under `legal.*`; the page lists them in
 * `src/constants/legal/` and `LegalDocument` draws them.
 */

import type { MessageKey } from '@/i18n/keys';

/** A link under a section: a site path (kept in the reader's language), a URL or a `mailto:`. */
export type LegalLink = { href: string; label: MessageKey };

export type LegalSection = {
  /** The section's anchor and test id. */
  id: string;
  title: MessageKey;
  /** Paragraphs, in order. */
  body?: readonly MessageKey[];
  /** A bulleted list after the paragraphs. */
  list?: readonly MessageKey[];
  /** Paragraphs after the list. */
  after?: readonly MessageKey[];
  links?: readonly LegalLink[];
};

export type LegalDocumentSpec = {
  id: 'privacy' | 'terms' | 'support';
  title: MessageKey;
  updated: MessageKey;
  intro: MessageKey;
  sections: readonly LegalSection[];
};
