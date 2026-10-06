'use client';

import { useEffect } from 'react';
import { hexToNpub } from '@nostr-wot/data';
import { nostrActions } from '@/services/nostr-bridge';

export type PanelAnchor = { x: number; y: number; placement?: 'top' | 'bottom' };

/**
 * Where the profile popover sits: fixed bottom-left of the viewport by
 * default (Discord-style), or above/below an anchor kept 8px inside the
 * window.
 */
export function panelPositionStyle(
  anchor: PanelAnchor | undefined,
  viewport: { width: number; height: number },
): React.CSSProperties {
  return anchor
    ? {
        position: 'fixed',
        left: Math.max(8, Math.min(viewport.width - 348, anchor.x)),
        ...(anchor.placement === 'top'
          ? { bottom: viewport.height - anchor.y + 8 }
          : { top: anchor.y + 8 }),
      }
    : { position: 'fixed', left: 8, bottom: 72 };
}

/** `npub1…` for a hex key, or `null` when it is not one. */
export function safeNpub(pubkey: string): string | null {
  try { return hexToNpub(pubkey); } catch { return null; }
}

/**
 * The user panel's side effects: fetch the profile, and while the
 * fullscreen settings are open, close on Escape and lock the page scroll.
 */
export function useUserPanelEffects(pubkey: string, editing: boolean, onClose: () => void) {
  useEffect(() => {
    nostrActions.ensureUserMetadata(pubkey).catch(() => {});
  }, [pubkey]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [editing, onClose]);
}
