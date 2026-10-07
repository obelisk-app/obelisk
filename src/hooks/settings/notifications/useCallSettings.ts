'use client';

import { useState } from 'react';
import { setPreference, type CallIpProtection, type CallsFrom } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import type { CallRelayStatus } from '@/hooks/settings/notifications/useCallRelayEditor';

/** The DM call settings: who can ring, IP protection, the relay list and its status line. */
export function useCallSettings() {
  const prefs = usePreferences();
  const [status, setStatus] = useState<CallRelayStatus>('idle');
  return {
    callsFrom: prefs.callsFrom,
    setCallsFrom: (v: CallsFrom) => setPreference('callsFrom', v),
    ipProtection: prefs.callIpProtection,
    setIpProtection: (v: CallIpProtection) => setPreference('callIpProtection', v),
    relays: prefs.callRelays,
    /** Remounts the relay editor whenever the saved list changes. */
    relaysKey: prefs.callRelays.join(' '),
    status,
    setStatus,
  };
}
