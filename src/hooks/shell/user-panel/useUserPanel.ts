'use client';

import { useEffect, useState } from 'react';
import { useSessionActions, useSessionProfile } from '@/hooks/session/useSession';
import { displayNameFor } from '@/utils/identity/display-name';
import { npubOrNull } from '@/utils/identity/short-npub';
import type { SettingsSection } from '@/services/settings/open-settings';

/**
 * The user panel's side effects: while the
 * fullscreen settings are open, close on Escape and lock the page scroll.
 */
export function useUserPanelEffects(editing: boolean, onClose: () => void) {
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
  const meta = useSessionProfile();
  const { logout } = useSessionActions();
  const [editing, setEditing] = useState(initialEditing);
  const [settingsTab, setSettingsTab] = useState<SettingsSection>(initialTab === 'preferences' ? 'general' : initialTab);
  useUserPanelEffects(editing, onClose);
  return {
    meta,
    displayName: displayNameFor(pubkey, meta),
    npub: npubOrNull(pubkey),
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
      else void logout();
    },
  };
}
