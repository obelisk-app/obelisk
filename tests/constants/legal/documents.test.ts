import { describe, expect, it } from 'vitest';
import { flatMessages, LOCALES } from '@tests/support/messages';
import { translator } from '@tests/support/intl';
import { LEGAL_EMAIL, LEGAL_LINKS, LEGAL_VALUES, SECURITY_EMAIL } from '@/constants/legal/contact';
import { PRIVACY_DOCUMENT } from '@/constants/legal/privacy';
import { SUPPORT_DOCUMENT } from '@/constants/legal/support';
import { TERMS_DOCUMENT } from '@/constants/legal/terms';
import type { MessageKey } from '@/i18n/keys';
import type { LegalDocumentSpec } from '@/types/legal/document';

const DOCUMENTS = [PRIVACY_DOCUMENT, TERMS_DOCUMENT, SUPPORT_DOCUMENT];

/** Every message key a document draws: its head, its sections, its link labels. */
function keysOf(doc: LegalDocumentSpec): MessageKey[] {
  return [
    doc.title, doc.updated, doc.intro,
    ...doc.sections.flatMap((s) => [
      s.title, ...(s.body ?? []), ...(s.list ?? []), ...(s.after ?? []), ...(s.links ?? []).map((l) => l.label),
    ]),
  ];
}

describe('the legal documents', () => {
  it('draw every sentence written for them: no copy under legal.* is left out', () => {
    const used = new Set<string>(DOCUMENTS.flatMap(keysOf));
    const written = Object.keys(flatMessages('en')).filter((k) => k.startsWith('legal.'));
    expect(written.filter((k) => !used.has(k))).toEqual([]);
  });

  it.each(DOCUMENTS.map((d) => [d.id, d] as const))('%s: unique section ids, and no sentence drawn twice', (_id, doc) => {
    const ids = doc.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const own = keysOf(doc).filter((k) => !k.startsWith('legal.links.'));
    expect(new Set(own).size).toBe(own.length);
    for (const key of own) expect(key.startsWith(`legal.${doc.id}.`), key).toBe(true);
  });

  it('share one date, written out in each language', () => {
    const DATE = { en: '12 October 2026', es: '12 de octubre de 2026', pt: '12 de outubro de 2026' } as const;
    for (const locale of LOCALES) {
      const t = translator(locale);
      for (const doc of DOCUMENTS) expect(t(doc.updated), `${locale} ${doc.id}`).toContain(DATE[locale]);
    }
  });

  it('give the addresses ABUSE.md and SECURITY.md publish, and never write one into the copy', () => {
    expect(LEGAL_EMAIL).toBe('abuse@obelisk.ar');
    expect(SECURITY_EMAIL).toBe('security@obelisk.ar');
    expect(LEGAL_LINKS.email.href).toBe('mailto:abuse@obelisk.ar');
    expect(LEGAL_LINKS.issues.href).toBe('https://github.com/obelisk-app/obelisk/issues');
    for (const locale of LOCALES) {
      for (const [key, text] of Object.entries(flatMessages(locale))) {
        if (key.startsWith('legal.')) expect(text, `${locale} ${key}`).not.toMatch(/@obelisk\.ar/);
      }
    }
  });

  it.each(LOCALES)('name the two relays the project runs, in the policy and in the terms (%s)', (locale) => {
    const t = translator(locale);
    for (const key of ['legal.privacy.ourRelays.p1', 'legal.terms.what.p2'] as const) {
      expect(t(key)).toContain('wss://public.obelisk.ar');
      expect(t(key)).toContain('wss://lacrypta-relay.obelisk.ar');
    }
  });

  it.each(LOCALES)('the terms commit to 24 hours on our relays only, and say what is not possible elsewhere (%s)', (locale) => {
    const t = translator(locale);
    expect(t('legal.terms.enforcement.p1')).toContain('24');
    expect(t('legal.terms.enforcement.p2')).toContain('NIP-11');
    // The commitment is the terms page's alone: the support page points to it.
    for (const key of keysOf(SUPPORT_DOCUMENT).concat(keysOf(PRIVACY_DOCUMENT))) {
      expect(t(key, LEGAL_VALUES), key).not.toMatch(/\b24\b/);
    }
  });

  it.each(LOCALES)('the policy names what leaves the device and how to take it back (%s)', (locale) => {
    const t = translator(locale);
    expect(t('legal.privacy.website.p3')).toContain('Google Analytics');
    expect(t('legal.privacy.deletion.p2')).toContain('NIP-09');
    expect(t('legal.privacy.deletion.p3', LEGAL_VALUES)).toContain(LEGAL_EMAIL);
    expect(t('legal.privacy.dms.p2')).toContain('NIP-17');
    expect(t('legal.privacy.who.p2')).toContain('Dandelion Labs JSC');
    expect(t('legal.privacy.children.p1')).toContain('13');
  });
});
