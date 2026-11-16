'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useConcordNavigation } from '@/store/chat/concord';
import { parseConcordLocation } from '@/schemas/chat/concord-location';

/** Both shells yield URL ownership while a Concord community is displayed. */
export function useConcordLocation(loggedIn: boolean) {
  const { open, communityId, channelId } = useConcordNavigation();
  useLayoutEffect(() => {
    const location = parseConcordLocation(window.location.hash);
    if (location) useConcordNavigation.setState({ ...location, open: true });
  }, []);
  useEffect(() => {
    const restore = () => {
      const location = parseConcordLocation(window.location.hash);
      if (location) useConcordNavigation.setState({ ...location, open: true });
      else useConcordNavigation.getState().close();
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore); };
  }, []);
  useEffect(() => {
    if (!loggedIn || !open || !communityId) return;
    const params = new URLSearchParams({ concord: communityId });
    if (channelId) params.set('channel', channelId);
    const next = `${window.location.pathname}#${params}`;
    if (window.location.pathname + window.location.search + window.location.hash === next) return;
    window.history.pushState({ ...window.history.state, guard: false }, '', next);
  }, [loggedIn, open, communityId, channelId]);
}
