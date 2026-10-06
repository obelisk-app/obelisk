import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatLinkTarget, navigateInApp } from '@/utils/message-text/chat-link';

describe('chatLinkTarget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads slug, message and post from a same-origin /chat link', () => {
    const href = `${window.location.origin}/chat?c=general&m=abc`;
    expect(chatLinkTarget(href)).toEqual({ path: '/chat?c=general&m=abc', slug: 'general', messageId: 'abc', postId: undefined });
    expect(chatLinkTarget('/chat?p=xyz')).toEqual({ path: '/chat?p=xyz', slug: null, messageId: undefined, postId: 'xyz' });
  });

  it('ignores other origins and paths', () => {
    expect(chatLinkTarget('https://other.example/chat?c=x')).toBeNull();
    expect(chatLinkTarget(`${window.location.origin}/notes/1`)).toBeNull();
  });

  it('navigates with pushState and a popstate event', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const onPop = vi.fn();
    window.addEventListener('popstate', onPop);
    navigateInApp('/chat?c=general');
    window.removeEventListener('popstate', onPop);
    expect(push).toHaveBeenCalledWith(null, '', '/chat?c=general');
    expect(onPop).toHaveBeenCalledTimes(1);
  });
});
