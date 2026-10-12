/**
 * Legal: the terms of use (`/terms`), section by section. The copy is
 * `legal.terms.*`. The conduct, report and enforcement sections are what
 * App Store guideline 1.2 asks of an app with user-generated content, and
 * the iOS app's sign-in screen links this page.
 */

import type { LegalDocumentSpec } from '@/types/legal/document';
import { LEGAL_LINKS } from './contact';

export const TERMS_DOCUMENT: LegalDocumentSpec = {
  id: 'terms',
  title: 'legal.terms.title',
  updated: 'legal.terms.updated',
  intro: 'legal.terms.intro',
  sections: [
    {
      id: 'what',
      title: 'legal.terms.what.title',
      body: ['legal.terms.what.p1', 'legal.terms.what.p2', 'legal.terms.what.p3'],
    },
    { id: 'keys', title: 'legal.terms.keys.title', body: ['legal.terms.keys.p1', 'legal.terms.keys.p2'] },
    {
      id: 'conduct',
      title: 'legal.terms.conduct.title',
      body: ['legal.terms.conduct.p1'],
      list: [
        'legal.terms.conduct.i1', 'legal.terms.conduct.i2', 'legal.terms.conduct.i3', 'legal.terms.conduct.i4',
        'legal.terms.conduct.i5', 'legal.terms.conduct.i6', 'legal.terms.conduct.i7', 'legal.terms.conduct.i8',
      ],
      after: ['legal.terms.conduct.after'],
    },
    {
      id: 'report',
      title: 'legal.terms.report.title',
      body: ['legal.terms.report.p1', 'legal.terms.report.p2', 'legal.terms.report.p3'],
      links: [LEGAL_LINKS.email],
    },
    {
      id: 'enforcement',
      title: 'legal.terms.enforcement.title',
      body: [
        'legal.terms.enforcement.p1', 'legal.terms.enforcement.p2', 'legal.terms.enforcement.p3',
        'legal.terms.enforcement.p4',
      ],
      links: [LEGAL_LINKS.abusePolicy],
    },
    {
      id: 'third-party',
      title: 'legal.terms.thirdParty.title',
      body: ['legal.terms.thirdParty.p1', 'legal.terms.thirdParty.p2'],
    },
    {
      id: 'payments',
      title: 'legal.terms.payments.title',
      body: ['legal.terms.payments.p1', 'legal.terms.payments.p2', 'legal.terms.payments.p3'],
    },
    {
      id: 'software',
      title: 'legal.terms.software.title',
      body: ['legal.terms.software.p1', 'legal.terms.software.p2'],
      links: [LEGAL_LINKS.license],
    },
    { id: 'age', title: 'legal.terms.age.title', body: ['legal.terms.age.p1'] },
    { id: 'changes', title: 'legal.terms.changes.title', body: ['legal.terms.changes.p1'] },
    {
      id: 'contact',
      title: 'legal.terms.contact.title',
      body: ['legal.terms.contact.p1'],
      links: [LEGAL_LINKS.email, LEGAL_LINKS.issues, LEGAL_LINKS.privacy, LEGAL_LINKS.support],
    },
  ],
};
