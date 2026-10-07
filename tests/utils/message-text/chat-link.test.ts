import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatLinkTarget, navigateInApp } from '@/utils/message-text/chat-link';
import { isModifiedClick } from '@/utils/message-text/chat-link';

describe('chatLinkTarget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads slug, message and post from a same-origin /chat link', () => {
    const href = `${window.location.origin}/chat?c=general&m=abc`;
    expect(chatLinkTarget(href)).toEqual({ path: '/app?c=general&m=abc', slug: 'general', messageId: 'abc', postId: undefined });
    expect(chatLinkTarget('/chat?p=xyz')).toEqual({ path: '/app?p=xyz', slug: null, messageId: undefined, postId: 'xyz' });
  });

  it('accepts /app and the prefixed shells, and keeps the reader in their language', () => {
    window.history.replaceState(null, '', '/es/app?c=old');
    try {
      expect(chatLinkTarget('/app?c=general')?.path).toBe('/es/app?c=general');
      expect(chatLinkTarget('/pt/chat?c=general')?.path).toBe('/es/app?c=general');
      expect(chatLinkTarget('/es/notes/x')).toBeNull();
    } finally {
      window.history.replaceState(null, '', '/');
    }
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

describe('isModifiedClick', () => {
  const click = (over = {}) => ({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over });
  it('is true with any modifier held, false for a plain click', () => {
    expect(isModifiedClick(click())).toBe(false);
    for (const k of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) expect(isModifiedClick(click({ [k]: true }))).toBe(true);
  });
});
