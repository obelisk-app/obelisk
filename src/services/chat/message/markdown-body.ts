/**
 * Loads `MarkdownBody` (and with it react-markdown) the first time a message
 * renders, instead of with the chat's first JavaScript.
 *
 * One module-level promise serves every message, so the chunk is fetched
 * once. `useMarkdownBody` (src/hooks/chat/message/) returns null until it
 * arrives, and the caller shows the plain text; after it arrives every render
 * is synchronous, so a list of messages never flickers again.
 */
import { createElement, type ReactElement } from 'react';
import type { Components } from 'react-markdown';

/**
 * A render function rather than a component: a component handed back from a
 * hook would count as "created during render" and remount on every render.
 * It renders the module's `MarkdownBody`.
 */
export type RenderMarkdownBody = (text: string, components: Components) => ReactElement;

let loaded: RenderMarkdownBody | null = null;
let pending: Promise<RenderMarkdownBody> | null = null;

/** Starts the download (once) and resolves with the renderer. Tests await it before rendering. */
export function preloadMarkdownBody(): Promise<RenderMarkdownBody> {
  pending ??= import('@/components/chat/message/MarkdownBody').then((mod) => {
    const render: RenderMarkdownBody = (text, components) => createElement(mod.default, { text, components });
    loaded = render;
    return render;
  });
  return pending;
}

/** The renderer once it has arrived, else null. */
export function loadedMarkdownBody(): RenderMarkdownBody | null {
  return loaded;
}
