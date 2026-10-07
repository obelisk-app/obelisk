'use client';

/**
 * The markdown renderer for a message, once its chunk has loaded
 * (`src/services/chat/message/markdown-body.ts`): null until then, and the
 * load is started on first use.
 */
import { useEffect, useState } from 'react';
import { loadedMarkdownBody, preloadMarkdownBody, type RenderMarkdownBody } from '@/services/chat/message/markdown-body';

/** The markdown renderer once loaded, else null (and the load is started). */
export function useMarkdownBody(): RenderMarkdownBody | null {
  const [component, setComponent] = useState<RenderMarkdownBody | null>(() => loadedMarkdownBody());
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
