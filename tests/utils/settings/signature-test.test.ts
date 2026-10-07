import { describe, expect, it } from 'vitest';
import { mockSignatureTemplate, pendingSignatures, signatureTally } from '@/utils/settings/signature-test';

describe('signature test helpers', () => {
  it('makes relay auth an empty challenge and every other kind a tagged dummy message', () => {
    expect(mockSignatureTemplate(22242, { content: 'c', alt: 'a' })).toEqual({
      kind: 22242,
      content: '',
      tags: [['relay', 'wss://public.obelisk.ar'], ['challenge', 'obelisk-developer-signature-test'], ['client', 'Obelisk']],
    });
    expect(mockSignatureTemplate(1, { content: 'Test kind 1', alt: 'Test' })).toEqual({
      kind: 1, content: 'Test kind 1', tags: [['client', 'Obelisk'], ['alt', 'Test']],
    });
  });

  it('starts every kind pending and tallies the answers', () => {
    const pending = pendingSignatures([1, 7]);
    expect(pending).toEqual({ 1: 'pending', 7: 'pending' });
    expect(signatureTally(pending)).toEqual({ requested: 2, accepted: 0, rejected: 0 });
    expect(signatureTally({ 1: 'accepted', 7: 'rejected', 9: 'accepted' })).toEqual({ requested: 3, accepted: 2, rejected: 1 });
    expect(signatureTally({})).toEqual({ requested: 0, accepted: 0, rejected: 0 });
  });
});
