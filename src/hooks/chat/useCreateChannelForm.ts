'use client';

/**
 * The "new channel" form, shared by the desktop sidebar's inline section
 * (`CreateGroupSection`) and the phone's bottom sheet (`CreateChannelSheet`).
 * Just the name: the relay decides who may publish kind 9007, so the form is
 * not gated by role and a rejected publish surfaces inline as `error`.
 */
import { useCallback, useState, type FormEvent } from 'react';
import { nostrActions } from '@/services/nostr-bridge';

export interface CreateChannelForm {
  readonly name: string;
  readonly setName: (name: string) => void;
  readonly busy: boolean;
  readonly error: string | null;
  /** A non-empty trimmed name and no publish in flight. */
  readonly canSubmit: boolean;
  /** Publishes a public, open channel; calls `onCreated` with the new id. */
  readonly submit: (e?: FormEvent) => Promise<void>;
  /** Drops the draft and any error, for a cancelled form. */
  readonly reset: () => void;
}

export function useCreateChannelForm(onCreated: (groupId: string) => void): CreateChannelForm {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  const reset = useCallback(() => {
    setName('');
    setError(null);
  }, []);

  const submit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const id = await nostrActions.createGroup({ name: trimmed, isPublic: true, isOpen: true });
      setName('');
      onCreated(id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canSubmit, trimmed, onCreated]);

  return { name, setName, busy, error, canSubmit, submit, reset };
}
