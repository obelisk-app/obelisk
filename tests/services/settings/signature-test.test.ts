import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { requestMockSignatures } from '@/services/settings/signature-test';
import { mockSignatureTemplate } from '@/utils/settings/signature-test';

afterEach(() => unregisterBridge());

describe('requestMockSignatures', () => {
  it('asks for every kind and reports each answer', async () => {
    const signEventTemplate = vi.fn(async (template: { kind: number }) => {
      if (template.kind === 7) throw new Error('refused');
      return { id: 'signed' };
    });
    unregisterBridge();
    registerBridge(fakeBridge({}, { signEventTemplate } as never));
    const onResult = vi.fn();
    await requestMockSignatures([1, 7], (kind) => mockSignatureTemplate(kind, { content: 'c', alt: 'a' }), onResult);
    expect(signEventTemplate.mock.calls.map(([t]) => t.kind)).toEqual([1, 7]);
    expect(onResult).toHaveBeenCalledWith(1, 'accepted');
    expect(onResult).toHaveBeenCalledWith(7, 'rejected');
  });
});
