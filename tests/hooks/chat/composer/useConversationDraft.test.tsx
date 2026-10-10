import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationDraft, useDraftField } from '@/hooks/chat/composer/useConversationDraft';
import { clearConversationDrafts } from '@/store/chat/composer-drafts';

let account = 'alice';
vi.mock('@/hooks/session/useSession', () => ({ useMyPubkey: () => account }));
beforeEach(() => { clearConversationDrafts(); account = 'alice'; });
const mount = (conversation = 'general', relay = 'wss://one') => renderHook(() => {
  const entry = useConversationDraft('channel', conversation, relay);
  return { entry, text: useDraftField(entry, 'text', '') };
});

describe('memory-only conversation drafts', () => {
  it('restores only the matching account, relay and conversation after remount', () => {
    const original = mount();
    act(() => original.result.current.text[1]('private draft'));
    original.unmount();
    expect(mount('other').result.current.text[0]).toBe('');
    expect(mount('general', 'wss://two').result.current.text[0]).toBe('');
    account = 'bob';
    expect(mount().result.current.text[0]).toBe('');
    account = 'alice';
    expect(mount().result.current.text[0]).toBe('private draft');
  });

  it('revokes previews and fences late upload writes after logout cleanup', () => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', { revokeObjectURL: revoke });
    const original = mount();
    const lateWrite = original.result.current.text[1];
    original.result.current.entry.urls.add('blob:preview');
    act(() => { lateWrite('draft'); clearConversationDrafts(); });
    act(() => lateWrite('late result'));
    expect(original.result.current.text[0]).toBe('');
    expect(mount().result.current.text[0]).toBe('');
    expect(revoke).toHaveBeenCalledWith('blob:preview');
    vi.unstubAllGlobals();
  });
});
