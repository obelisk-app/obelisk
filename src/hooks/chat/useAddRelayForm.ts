'use client';

import { useState, type FormEvent } from 'react';
import { nostrActions } from '@/services/nostr-bridge';
import { normalizeRelayInput } from '@/utils/relay-url/relay-url-input';

export interface AddRelayForm {
  readonly url: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly setUrl: (value: string) => void;
  /** Normalize the typed address, add the relay, switch to it, then `onAdded`. */
  readonly submit: (event?: FormEvent) => Promise<void>;
}

/**
 * The "custom relay" form, headless: the `wss://` default, the
 * prefix-and-parse rule, then add-then-switch. `ServerRail`'s
 * `CustomRelayForm` and the phone `AddRelaySheet` both render this.
 */
export function useAddRelayForm(onAdded: () => void): AddRelayForm {
  const [url, setUrl] = useState('wss://');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    if (!url.trim()) return;
    const value = normalizeRelayInput(url);
    if (!value) {
      setError('Invalid URL');
      return;
    }
    setBusy(true);
    try {
      await nostrActions.addRelay(value);
      await nostrActions.switchRelay(value);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return { url, busy, error, setUrl, submit };
}

export interface SuggestedRelayAdd {
  readonly busy: boolean;
  readonly error: string | null;
  /** Add a relay from the suggested list (no switch), then `onAdded`. */
  readonly add: () => Promise<void>;
}

/**
 * One suggested-relay row's "Add" button. Adding a suggestion does not
 * switch to it, unlike the custom form: the user is browsing a list, not
 * typing a destination.
 */
export function useSuggestedRelayAdd(url: string, alreadyAdded: boolean, onAdded: () => void): SuggestedRelayAdd {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (alreadyAdded || busy) return;
    setError(null);
    setBusy(true);
    try {
      await nostrActions.addRelay(url);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, add };
}
