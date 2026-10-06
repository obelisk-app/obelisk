'use client';

/**
 * Loads `MarkdownBody` (and with it react-markdown) the first time a message
 * renders, instead of with the chat's first JavaScript.
 *
 * One module-level promise serves every message, so the chunk is fetched
 * once. Until it arrives `useMarkdownBody` returns null and the caller shows
 * the plain text; after it arrives every render is synchronous, so a list of
 * messages never flickers again.
 */
import { useEffect, useState } from 'react';

/**
 * A render function rather than a component: a component handed back from a
 * hook would count as "created during render" and remount on every render.
 */
export type RenderMarkdownBody = typeof import('@/components/chat/message/MarkdownBody').renderMarkdownBody;

let loaded: RenderMarkdownBody | null = null;
let pending: Promise<RenderMarkdownBody> | null = null;

/** Starts the download (once) and resolves with the renderer. Tests await it before rendering. */
export function preloadMarkdownBody(): Promise<RenderMarkdownBody> {
  pending ??= import('@/components/chat/message/MarkdownBody').then((mod) => {
    loaded = mod.renderMarkdownBody;
    return loaded;
  });
  return pending;
}

/** The markdown renderer once loaded, else null (and the load is started). */
export function useMarkdownBody(): RenderMarkdownBody | null {
  const [component, setComponent] = useState<RenderMarkdownBody | null>(() => loaded);
  useEffect(() => {
    if (component) return;
    let alive = true;
    void preloadMarkdownBody().then((c) => {
      if (alive) setComponent(() => c);
    });
    return () => {
      alive = false;
    };
  }, [component]);
  return component;
}
