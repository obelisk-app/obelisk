'use client';

/**
 * Phase 1 of the voice room: who is allowed in. Subscribes to the channel's
 * NIP-29 admins (39001), members (39002), the group's `["open"]` flag and
 * the bridge's "membership ready" signal, and decides between `ready` and
 * `not-a-member`. While a client is running it also pushes the live role
 * and openness changes into it.
 */
import { useEffect, useState, type MutableRefObject } from 'react';
import { useBridge } from '@/services/nostr-bridge';
import type { VoiceClient } from '@/services/voice/client';
import { voiceErrorCode, type VoiceErrorCode } from '@/utils/voice/errors';

export type AuthGate =
  | { phase: 'init' }
  | { phase: 'loading-roles' }
  | { phase: 'not-a-member' }
  | { phase: 'ready'; members: readonly string[]; admins: readonly string[]; open: boolean };

const LOADING: AuthGate = { phase: 'loading-roles' };

export function useVoiceRoomGate(
  channelId: string,
  clientRef: MutableRefObject<VoiceClient | null>,
  setError: (code: VoiceErrorCode) => void,
): { gate: AuthGate; selfPubkey: string } {
  // The decision is stored with the channel it was made for. A decision for
  // another channel reads as "loading" here, so switching channels never
  // shows one render of the previous channel's verdict (it used to: the
  // reset ran in the effect, after that render had painted).
  const [decided, setDecided] = useState<{ channelId: string; gate: AuthGate } | null>(null);
  const gate: AuthGate = decided?.channelId === channelId ? decided.gate : LOADING;
  const [selfPubkey, setSelfPubkey] = useState<string>('');
  // The provider's bridge: null until it has restored the session, and the
  // gate stays loading until then.
  const bridge = useBridge();

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    let unsubMembers: (() => void) | null = null;
    let unsubAdmins: (() => void) | null = null;
    let unsubReady: (() => void) | null = null;

    let latestMembers: readonly string[] = [];
    let latestAdmins: readonly string[] = [];
    let membershipReady = false;
    let isOpen = false;
    let unsubGroups: (() => void) | null = null;
    let resolveTimer: ReturnType<typeof setTimeout> | null = null;
    const setGate = (next: AuthGate) => setDecided({ channelId, gate: next });

    (async () => {
      try {
        const pk = bridge.getPublicKey();
        if (!pk) {
          setError('notLoggedIn');
          return;
        }
        setSelfPubkey(pk);

        const decide = () => {
          if (cancelled) return;
          // Push live state into the running client. setOpen is critical:
          // if the channel's `["open"]` flag arrives after the client was
          // constructed, without this the local user sees nobody but
          // themselves because subscribeRoster's filter drops every remote
          // pubkey that isn't in the (still-empty) member set.
          clientRef.current?.setOpen(isOpen);
          clientRef.current?.updateRoles(latestMembers, latestAdmins);
          // Open channels (NIP-29 `["open"]` tag on kind 39000) admit
          // anyone; gating those on member/admin presence forces the
          // "not a member" screen for users who joined via the open flow
          // without an explicit kind 9000 ever landing on this relay.
          if (isOpen || latestMembers.includes(pk) || latestAdmins.includes(pk)) {
            setGate({ phase: 'ready', members: latestMembers, admins: latestAdmins, open: isOpen });
          } else {
            setGate({ phase: 'not-a-member' });
          }
        };

        // Resolve immediately on a positive match (or open channel).
        // Otherwise wait for the bridge's "membership ready" signal,
        // flipped to true the first time the relay delivers a 39001 or
        // 39002 event for this group. Without that signal, an empty list
        // could mean "not loaded yet" (slow NIP-42 round-trip) just as
        // easily as "user is not a member", and falsely flipping to
        // "not-a-member" is what forces the refresh-loop UX.
        const tryResolve = () => {
          if (cancelled) return;
          if (isOpen || latestMembers.includes(pk) || latestAdmins.includes(pk)) {
            decide();
            return;
          }
          if (membershipReady) decide();
        };

        unsubGroups = bridge.subscribeGroups((groups) => {
          const next = groups.find((g) => g.id === channelId)?.isOpen ?? false;
          if (next === isOpen) return;
          isOpen = next;
          tryResolve();
        });
        unsubMembers = bridge.subscribeMembers(channelId, (members) => {
          latestMembers = members;
          tryResolve();
        });
        unsubAdmins = bridge.subscribeAdmins(channelId, (admins) => {
          latestAdmins = admins;
          tryResolve();
        });
        unsubReady = bridge.subscribeMembershipReady(channelId, (ready) => {
          membershipReady = ready;
          tryResolve();
        });

        // Hard ceiling: if nothing came back at all after 12s, surface an
        // error so the user isn't stuck on a silent spinner.
        resolveTimer = setTimeout(() => {
          if (cancelled) return;
          if (!membershipReady) {
            setError('membership');
          }
        }, 12000);
      } catch (e) {
        console.warn('[voice] membership gate failed', e);
        if (!cancelled) setError(voiceErrorCode(e, 'membership'));
      }
    })();

    return () => {
      cancelled = true;
      if (resolveTimer) clearTimeout(resolveTimer);
      unsubGroups?.();
      unsubMembers?.();
      unsubAdmins?.();
      unsubReady?.();
    };
  }, [bridge, channelId, clientRef, setError]);

  return { gate, selfPubkey };
}
