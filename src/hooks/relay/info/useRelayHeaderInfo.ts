'use client';

import { useEffect, useState } from 'react';
import { faviconFor, fetchRelayInfo } from '@/services/relay/relay-info';

export interface RelayHeaderInfo {
  /** The NIP-11 name, or undefined until (and unless) the document names one. */
  name?: string;
  /** The NIP-11 icon, else the relay's favicon; undefined once it failed to load. */
  icon?: string;
  /** Hand to the `<img onError>`: drops the icon for this relay. */
  onIconError: () => void;
}

/**
 * The relay's NIP-11 name and icon for the header of both shells (the
 * desktop top bar and the phone's server screen). Each used to carry its own
 * copy of this fetch.
 *
 * Switching relays keeps showing the previous relay's name and icon until the
 * new document lands, rather than flashing the bare host in between. No relay
 * reads as nothing known.
 */
export function useRelayHeaderInfo(relay: string | null | undefined): RelayHeaderInfo {
  const [info, setInfo] = useState<{ name?: string; icon?: string } | null>(null);
  // Stamped with the relay whose icon failed, so switching relays retries
  // the new icon with no reset step.
  const [iconFailedFor, setIconFailedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!relay) return;
    let alive = true;
    fetchRelayInfo(relay).then((r) => {
      if (!alive) return;
      setInfo({ name: r?.name, icon: r?.icon || faviconFor(relay) || undefined });
    });
    return () => {
      alive = false;
    };
  }, [relay]);
  const known = relay ? info : null;
  return {
    name: known?.name,
    icon: !relay || iconFailedFor === relay ? undefined : known?.icon,
    onIconError: () => setIconFailedFor(relay ?? null),
  };
}
