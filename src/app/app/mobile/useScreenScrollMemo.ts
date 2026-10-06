import { useLayoutEffect } from 'react';

// Preserve vertical scroll position across remounts when the user navigates
// between top-level tabs (e.g., server ↔ dms-list). Each screen unmounts on
// tab switch, so without this the scroll resets to 0 on every return.
const screenScrollMemo = new Map<string, number>();

export function useScreenScrollMemo(key: string, ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = screenScrollMemo.get(key);
    if (saved != null) el.scrollTop = saved;
    const onScroll = () => { screenScrollMemo.set(key, el.scrollTop); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); };
  }, [key, ref]);
}
