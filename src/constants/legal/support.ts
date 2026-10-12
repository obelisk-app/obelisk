/**
 * Legal: the support page (`/support`): how to reach the project, how to
 * report abuse, and four short answers. The copy is `legal.support.*`. It is
 * the Support URL of the iOS app's App Store listing.
 */

import type { LegalDocumentSpec } from '@/types/legal/document';
import { LEGAL_LINKS } from './contact';

export const SUPPORT_DOCUMENT: LegalDocumentSpec = {
  id: 'support',
  title: 'legal.support.title',
  updated: 'legal.support.updated',
  intro: 'legal.support.intro',
  sections: [
    {
      id: 'contact',
      title: 'legal.support.contact.title',
      body: ['legal.support.contact.p1', 'legal.support.contact.p2', 'legal.support.contact.p3'],
      links: [LEGAL_LINKS.email, LEGAL_LINKS.issues, LEGAL_LINKS.securityPolicy],
    },
    {
      id: 'abuse',
      title: 'legal.support.abuse.title',
      body: ['legal.support.abuse.p1', 'legal.support.abuse.p2'],
      links: [LEGAL_LINKS.terms, LEGAL_LINKS.abusePolicy],
    },
    {
      id: 'sign-in',
      title: 'legal.support.signIn.title',
      body: ['legal.support.signIn.p1', 'legal.support.signIn.p2', 'legal.support.signIn.p3'],
    },
    {
      id: 'lost-key',
      title: 'legal.support.lostKey.title',
      body: ['legal.support.lostKey.p1', 'legal.support.lostKey.p2'],
    },
    {
      id: 'delete-data',
      title: 'legal.support.deleteData.title',
      body: ['legal.support.deleteData.p1', 'legal.support.deleteData.p2'],
      links: [LEGAL_LINKS.localData],
    },
    {
      id: 'block',
      title: 'legal.support.block.title',
      body: ['legal.support.block.p1', 'legal.support.block.p2'],
    },
    {
      id: 'more',
      title: 'legal.support.more.title',
      links: [LEGAL_LINKS.help, LEGAL_LINKS.localData, LEGAL_LINKS.privacy, LEGAL_LINKS.terms],
    },
  ],
};
