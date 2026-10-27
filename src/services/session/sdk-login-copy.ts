import { SDK_LOGIN_COPY } from '@/constants/session/sdk-login-copy';
import type { Translate } from '@/i18n/keys';

const ATTRIBUTES = ['placeholder', 'aria-label'] as const;

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Rewrites the login widget's hardcoded English inside `root` with Obelisk's
 * messages (`SDK_LOGIN_COPY`). Text is changed through `nodeValue` only, so
 * every node React holds stays the same node and its next update still
 * applies; the whitespace around a split sentence ("Back this up ",
 * <strong>before</strong>) is kept. A rewritten attribute keeps the widget's
 * original in `data-obelisk-sdk-<name>` for selectors that key on it.
 */
export function localizeSdkLoginCopy(root: Element, t: Translate): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    const key = SDK_LOGIN_COPY[normalize(text)];
    if (!key) continue;
    const next = `${text.match(/^\s*/)?.[0] ?? ''}${t(key)}${text.match(/\s*$/)?.[0] ?? ''}`;
    if (next !== text) node.nodeValue = next;
  }
  for (const attribute of ATTRIBUTES) {
    const elements = [root, ...root.querySelectorAll(`[${attribute}]`)];
    for (const element of elements) {
      const value = element.getAttribute(attribute);
      const key = value ? SDK_LOGIN_COPY[normalize(value)] : undefined;
      if (!value || !key) continue;
      const next = t(key);
      if (next === value) continue;
      element.setAttribute(`data-obelisk-sdk-${attribute}`, value);
      element.setAttribute(attribute, next);
    }
  }
}

/**
 * Keeps every open login dialog (`.obelisk-login-modal`) in the reader's
 * language while it is mounted: the widget swaps views (method list, paste
 * form, new key, profile) and re-renders text, so each change is localized
 * again. The widget portals its overlay straight into `document.body`, which
 * is what is watched; returns the cleanup.
 */
export function watchSdkLoginCopy(t: Translate): () => void {
  const sync = () => {
    for (const modal of document.querySelectorAll('.obelisk-login-modal')) localizeSdkLoginCopy(modal, t);
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  sync();
  return () => observer.disconnect();
}
