'use client';

import { useEffect, useState } from 'react';
import { hexToNpub } from '@nostr-wot/data';
import { nostrActions, useUserMetadata } from '@/services/nostr-bridge';
import { displayNameFor } from '@/utils/identity/display-name';
import type { SettingsSection } from '@/utils/settings/open-settings';

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

/**
 * The user panel's view model: the person's profile, whether the
 * fullscreen settings are open and on which section, and logging out (the
 * host's handler when it has one, else the bridge's).
 */
export function useUserPanel({ pubkey, onClose, onLogout, initialEditing, initialTab }: {
  pubkey: string;
  onClose: () => void;
  onLogout?: () => void;
  initialEditing: boolean;
  /** `preferences` is the pre-sections name for "the app settings": it lands on the first of them. */
  initialTab: SettingsSection | 'preferences';
}) {
  const meta = useUserMetadata(pubkey);
  const [editing, setEditing] = useState(initialEditing);
  const [settingsTab, setSettingsTab] = useState<SettingsSection>(initialTab === 'preferences' ? 'general' : initialTab);
  useUserPanelEffects(pubkey, editing, onClose);
  return {
    meta,
    displayName: displayNameFor(pubkey, meta),
    npub: safeNpub(pubkey),
    editing,
    startEditing: () => setEditing(true),
    /** Settings saved or dismissed: close them and the panel. */
    finishEditing: () => {
      setEditing(false);
      onClose();
    },
    settingsTab,
    setSettingsTab,
    logout: () => {
      onClose();
      if (onLogout) onLogout();
      else void nostrActions.logout();
    },
  };
}
