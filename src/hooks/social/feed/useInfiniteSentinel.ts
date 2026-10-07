import { useEffect, useRef } from 'react';
import { watchSentinel } from '@/services/social/feed-scroll';

/**
 * Pages the next batch when the sentinel nears the viewport. Returns the
 * sentinel's ref.
 *
 * The handler is kept in a ref so the observer isn't torn down and rebuilt
 * every time its identity changes, which, since it closes over the current
 * page, is on every page.
 */
export function useInfiniteSentinel(onReach: () => void, disabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const onReachRef = useRef(onReach);
  useEffect(() => { onReachRef.current = onReach; }, [onReach]);

  useEffect(
    () => (disabled ? undefined : watchSentinel(ref.current, () => onReachRef.current())),
    [disabled],
  );

  return ref;
}
