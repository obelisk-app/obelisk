import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useMyPubkey } from '@/hooks/session/useSession';
import { setPreference } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import {
  invalidRelayIndexes,
  normalizeSocialRelays,
} from '@/utils/social/relays';
import { DEFAULT_SOCIAL_RELAYS, SOCIAL_RELAY_MAX } from '@/constants/social/relays';
import { applySocialRelays, importNip65Relays } from '@/services/social/pool';
import { getRelayStatuses, subscribeRelayStatus, watchRelays } from '@/services/social/relay-status';

export type SocialRelayDraftStatus = 'idle' | 'saved' | 'invalid' | 'importing' | 'import-empty';

import { relayKey } from '@/utils/settings/social-relays';

/**
 * The editable copy of `preferences.socialRelays` behind SocialRelaySettings:
 * the draft rows, which of them are invalid, live relay status, and the
 * add / preset / remove / save / import / reset actions.
 */
export function useSocialRelayDraft() {
  const saved = usePreferences().socialRelays;
  const myPubkey = useMyPubkey();
  const [draft, setDraft] = useState<string[]>(() => [...saved]);
  const [status, setStatus] = useState<SocialRelayDraftStatus>('idle');

  // Re-sync when another surface changes the list (e.g. an import
  // elsewhere), in the same render the new list arrives.
  const [syncedSaved, setSyncedSaved] = useState(saved);
  if (syncedSaved !== saved) {
    setSyncedSaved(saved);
    setDraft([...saved]);
  }

  const statuses = useSyncExternalStore(subscribeRelayStatus, getRelayStatuses, getRelayStatuses);

  // Watch what's SAVED, not the draft: probing every keystroke would open a
  // socket per character typed into the URL field.
  useEffect(() => { watchRelays(saved); }, [saved]);

  const invalid = useMemo(() => new Set(invalidRelayIndexes(draft)), [draft]);
  const canAdd = draft.length < SOCIAL_RELAY_MAX;

  const update = (index: number, value: string) => {
    setDraft((current) => current.map((entry, i) => (i === index ? value : entry)));
    setStatus('idle');
  };

  /**
   * Add a suggested relay.
   *
   * It drops into an empty row if the reader left one behind, rather than
   * appending past it; otherwise clicking a suggestion while a blank box is
   * open silently spends one of the eight slots on nothing.
   */
  const addPreset = (url: string) => {
    setDraft((current) => {
      if (current.some((entry) => relayKey(entry) === url)) return current;
      const blank = current.findIndex((entry) => !entry.trim());
      if (blank !== -1) return current.map((entry, i) => (i === blank ? url : entry));
      if (current.length >= SOCIAL_RELAY_MAX) return current;
      return [...current, url];
    });
    setStatus('idle');
  };

  const addBlank = () => {
    setDraft((current) => [...current, '']);
    setStatus('idle');
  };

  const remove = (index: number) => {
    setDraft((current) => current.filter((_, i) => i !== index));
    setStatus('idle');
  };

  const save = () => {
    const filled = draft.map((entry) => entry.trim()).filter(Boolean);
    if (filled.length === 0 || invalid.size > 0) {
      setStatus('invalid');
      return;
    }
    const normalized = normalizeSocialRelays(filled);
    setPreference('socialRelays', normalized);
    // Point the SDK at the new set immediately so the next fetch routes
    // correctly without a reload.
    applySocialRelays(normalized);
    setDraft(normalized);
    setStatus('saved');
  };

  const importFromNip65 = async () => {
    if (!myPubkey) return;
    setStatus('importing');
    try {
      const imported = await importNip65Relays(myPubkey);
      if (imported.length === 0) {
        setStatus('import-empty');
        return;
      }
      setDraft(imported);
      setStatus('idle');
    } catch {
      setStatus('import-empty');
    }
  };

  const reset = () => {
    setDraft([...DEFAULT_SOCIAL_RELAYS]);
    setStatus('idle');
  };

  return {
    draft,
    status,
    statuses,
    invalid,
    canAdd,
    canImport: Boolean(myPubkey),
    update,
    addPreset,
    addBlank,
    remove,
    save,
    importFromNip65,
    reset,
  };
}

export type SocialRelayDraft = ReturnType<typeof useSocialRelayDraft>;
