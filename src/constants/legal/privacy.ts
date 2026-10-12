/**
 * Legal: the privacy policy (`/privacy`), section by section. The copy is
 * `legal.privacy.*`. It states what the web app and the iOS app send, to
 * whom, and what they store, so a change to any of those (a new host, a new
 * permission, a new storage category) changes that copy and the date in
 * `legal.privacy.updated` in the same commit.
 */

import type { LegalDocumentSpec } from '@/types/legal/document';
import { LEGAL_LINKS } from './contact';

export const PRIVACY_DOCUMENT: LegalDocumentSpec = {
  id: 'privacy',
  title: 'legal.privacy.title',
  updated: 'legal.privacy.updated',
  intro: 'legal.privacy.intro',
  sections: [
    {
      id: 'short',
      title: 'legal.privacy.short.title',
      list: [
        'legal.privacy.short.i1', 'legal.privacy.short.i2', 'legal.privacy.short.i3',
        'legal.privacy.short.i4', 'legal.privacy.short.i5',
      ],
    },
    {
      id: 'who',
      title: 'legal.privacy.who.title',
      body: ['legal.privacy.who.p1', 'legal.privacy.who.p2', 'legal.privacy.who.p3'],
    },
    {
      id: 'identity',
      title: 'legal.privacy.identity.title',
      body: ['legal.privacy.identity.p1', 'legal.privacy.identity.p2', 'legal.privacy.identity.p3'],
    },
    {
      id: 'publish',
      title: 'legal.privacy.publish.title',
      body: [
        'legal.privacy.publish.p1', 'legal.privacy.publish.p2', 'legal.privacy.publish.p3',
        'legal.privacy.publish.p4',
      ],
    },
    {
      id: 'our-relays',
      title: 'legal.privacy.ourRelays.title',
      body: ['legal.privacy.ourRelays.p1', 'legal.privacy.ourRelays.p2', 'legal.privacy.ourRelays.p3'],
    },
    {
      id: 'direct-messages',
      title: 'legal.privacy.dms.title',
      body: ['legal.privacy.dms.p1', 'legal.privacy.dms.p2', 'legal.privacy.dms.p3', 'legal.privacy.dms.p4'],
    },
    {
      id: 'network',
      title: 'legal.privacy.network.title',
      body: ['legal.privacy.network.p1'],
      list: [
        'legal.privacy.network.i1', 'legal.privacy.network.i2', 'legal.privacy.network.i3',
        'legal.privacy.network.i4', 'legal.privacy.network.i5', 'legal.privacy.network.i6',
      ],
      after: ['legal.privacy.network.after'],
    },
    {
      id: 'website',
      title: 'legal.privacy.website.title',
      body: [
        'legal.privacy.website.p1', 'legal.privacy.website.p2', 'legal.privacy.website.p3',
        'legal.privacy.website.p4',
      ],
    },
    {
      id: 'device',
      title: 'legal.privacy.device.title',
      body: ['legal.privacy.device.p1', 'legal.privacy.device.p2', 'legal.privacy.device.p3'],
      links: [LEGAL_LINKS.localData],
    },
    {
      id: 'permissions',
      title: 'legal.privacy.permissions.title',
      list: ['legal.privacy.permissions.i1', 'legal.privacy.permissions.i2', 'legal.privacy.permissions.i3'],
      after: ['legal.privacy.permissions.after'],
    },
    {
      id: 'zaps',
      title: 'legal.privacy.zaps.title',
      body: ['legal.privacy.zaps.p1', 'legal.privacy.zaps.p2', 'legal.privacy.zaps.p3'],
    },
    {
      id: 'deletion',
      title: 'legal.privacy.deletion.title',
      body: [
        'legal.privacy.deletion.p1', 'legal.privacy.deletion.p2', 'legal.privacy.deletion.p3',
        'legal.privacy.deletion.p4',
      ],
    },
    { id: 'children', title: 'legal.privacy.children.title', body: ['legal.privacy.children.p1'] },
    { id: 'changes', title: 'legal.privacy.changes.title', body: ['legal.privacy.changes.p1'] },
    {
      id: 'contact',
      title: 'legal.privacy.contact.title',
      body: ['legal.privacy.contact.p1'],
      links: [LEGAL_LINKS.email, LEGAL_LINKS.security, LEGAL_LINKS.terms, LEGAL_LINKS.support],
    },
  ],
};
