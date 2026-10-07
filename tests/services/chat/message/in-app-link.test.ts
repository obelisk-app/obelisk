import { afterEach, describe, expect, it, vi } from 'vitest';
import { followChannelPill, followInAppLink } from '@/services/chat/message/in-app-link';

const click = (over: Record<string, boolean> = {}) => ({
  metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...over,
}) as unknown as React.MouseEvent & { preventDefault: ReturnType<typeof vi.fn> };

describe('in-app links', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('followInAppLink pushes the path and fires popstate on a plain click only', () => {
    const pops = vi.fn();
    window.addEventListener('popstate', pops);
    const modified = click({ ctrlKey: true });
    followInAppLink(modified, '/app?u=1');
    expect(modified.preventDefault).not.toHaveBeenCalled();
    expect(pops).not.toHaveBeenCalled();
    const plain = click();
    followInAppLink(plain, '/app?u=1');
    expect(plain.preventDefault).toHaveBeenCalled();
    expect(window.location.search).toBe('?u=1');
    expect(pops).toHaveBeenCalledOnce();
    window.removeEventListener('popstate', pops);
  });

  it('followChannelPill navigates to the link\'s own path, blocks without access, leaves modified clicks', () => {
    const blocked = click();
    followChannelPill(blocked, '/app?c=x', true);
    expect(blocked.preventDefault).toHaveBeenCalled();
    expect(window.location.search).toBe('');
    const modified = click({ metaKey: true });
    followChannelPill(modified, '/app?c=x', false);
    expect(modified.preventDefault).not.toHaveBeenCalled();
    followChannelPill(click(), `${window.location.origin}/chat?c=general`, false);
    expect(window.location.pathname + window.location.search).toBe('/chat?c=general');
  });
});
