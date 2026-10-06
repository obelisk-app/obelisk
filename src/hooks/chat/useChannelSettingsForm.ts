'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { npubToHex } from '@nostr-wot/data';
import { nostrActions, useAdmins, useMembers, type JsForumTag, type JsGroup } from '@/services/nostr-bridge';

export type ChannelAccess = 'public' | 'read-only' | 'private';
export type ChannelKind = JsGroup['kind'];

export interface SfuVerification {
  readonly pubkey: string;
  readonly cap: number | null;
  readonly region: string | null;
}

export interface ChannelSettingsForm {
  // Metadata fields
  readonly name: string;
  readonly about: string;
  readonly picture: string;
  readonly banner: string;
  readonly access: ChannelAccess;
  readonly channelKind: ChannelKind;
  readonly forumTags: ReadonlyArray<JsForumTag>;
  readonly setName: (value: string) => void;
  readonly setAbout: (value: string) => void;
  readonly setPicture: (value: string) => void;
  readonly setBanner: (value: string) => void;
  readonly setAccess: (value: ChannelAccess) => void;
  readonly setChannelKind: (value: ChannelKind) => void;
  readonly setForumTags: (value: ReadonlyArray<JsForumTag>) => void;
  readonly savingMeta: boolean;
  readonly metaError: string | null;
  /** Verify the SFU when the kind is voice-sfu, publish the metadata, publish the pin, then `onSaved`. */
  readonly saveMeta: (event?: FormEvent) => Promise<void>;

  // SFU (only meaningful while `channelKind === 'voice-sfu'`)
  readonly sfuUrl: string;
  readonly setSfuUrl: (value: string) => void;
  readonly sfuChecking: boolean;
  readonly sfuVerified: SfuVerification | null;
  /** Probe `/info` on the SFU; resolves to the endpoint info or throws (and records the error). */
  readonly verifySfu: () => Promise<unknown>;

  // Member management
  readonly members: ReadonlyArray<string>;
  readonly admins: ReadonlyArray<string>;
  readonly adminSet: ReadonlySet<string>;
  /** Admins first, then members, deduplicated: what the mobile sheet lists. */
  readonly allPubkeys: ReadonlyArray<string>;
  readonly newMember: string;
  readonly setNewMember: (value: string) => void;
  readonly makeAdmin: boolean;
  readonly setMakeAdmin: (value: boolean) => void;
  readonly memberBusy: boolean;
  readonly memberError: string | null;
  readonly addMember: (event?: FormEvent) => Promise<void>;
}

const DEFAULT_SFU_URL = 'https://sfu.obelisk.ar';

/**
 * The channel settings form, headless: metadata, access preset, kind,
 * forum tags, SFU verification and member management. Both shells used to
 * carry this logic inline, and only the desktop copy verified the SFU
 * before switching a channel to `voice-sfu`; this hook is the single
 * implementation, with desktop's guard, so the phone sheet gets it too.
 */
export function useChannelSettingsForm(group: JsGroup, onSaved: () => void): ChannelSettingsForm {
  const [name, setName] = useState(group.name ?? '');
  const [about, setAbout] = useState(group.about ?? '');
  const [picture, setPicture] = useState(group.picture ?? '');
  const [banner, setBanner] = useState(group.banner ?? '');
  const [access, setAccess] = useState<ChannelAccess>(
    !group.isPublic ? 'private' : group.isRestricted ? 'read-only' : 'public',
  );
  const [channelKind, setChannelKind] = useState<ChannelKind>(group.kind);
  // Forum-container curated tags. Initialized from the relay's current
  // metadata so the admin sees the existing set on open; republished in
  // full on save because NIP-29 9002 is a full replacement. A skin that
  // does not render a tag editor simply never calls `setForumTags`, and
  // the existing set survives the save.
  const [forumTags, setForumTags] = useState<ReadonlyArray<JsForumTag>>(group.forumTags);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [newMember, setNewMember] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const members = useMembers(group.id);
  const admins = useAdmins(group.id);
  const adminSet = useMemo(() => new Set(admins), [admins]);
  const allPubkeys = useMemo(() => Array.from(new Set<string>([...admins, ...members])), [admins, members]);

  // A channel admin only chooses the SFU URL. `/info` supplies the identity
  // and relay compatibility fallback stored in the signed NIP-78 pin.
  const [sfuUrl, setSfuUrl] = useState('');
  const [sfuChecking, setSfuChecking] = useState(false);
  const [sfuVerified, setSfuVerified] = useState<SfuVerification | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { resolveSfuPin } = await import('@/services/voice/sfu-pin');
      const pin = await resolveSfuPin(group.id, 800);
      if (cancelled) return;
      setSfuUrl(pin?.url ?? process.env.NEXT_PUBLIC_SFU_URL ?? DEFAULT_SFU_URL);
      setSfuVerified(null);
    })();
    return () => { cancelled = true; };
  }, [group.id]);

  async function verifySfu() {
    const url = sfuUrl.trim();
    if (!url) throw new Error('SFU URL is required');
    setSfuChecking(true);
    setMetaError(null);
    try {
      const { fetchSfuInfo } = await import('@/services/voice/sfu-pin');
      const info = await fetchSfuInfo(url);
      setSfuUrl(info.url);
      setSfuVerified({ pubkey: info.pubkey, cap: info.cap, region: info.region });
      return info;
    } catch (err) {
      setSfuVerified(null);
      setMetaError((err as Error).message);
      throw err;
    } finally {
      setSfuChecking(false);
    }
  }

  async function saveMeta(event?: FormEvent) {
    event?.preventDefault();
    setSavingMeta(true);
    setMetaError(null);
    try {
      // Validate first so a bad SFU URL cannot leave the channel metadata
      // switched to voice-sfu without a usable pin.
      const verifiedSfu = channelKind === 'voice-sfu' && sfuUrl.trim()
        ? await verifySfu()
        : null;
      await nostrActions.editGroupMetadata({
        groupId: group.id,
        name,
        about,
        picture: picture || undefined,
        banner: banner || undefined,
        isPublic: access !== 'private',
        isHidden: access === 'private',
        isRestricted: access !== 'public',
        isOpen: access === 'public',
        kind: channelKind,
        // Only meaningful for forums; harmless on other kinds (the chip
        // bar only renders for `kind === 'forum'`). Passing the full set
        // every time keeps NIP-29 9002's full-replacement semantics from
        // dropping admin-curated tags.
        forumTags,
      });
      if (verifiedSfu) {
        const { publishSfuPin } = await import('@/services/voice/sfu-pin');
        await publishSfuPin(group.id, {
          pubkey: verifiedSfu.pubkey,
          url: verifiedSfu.url,
          trustedRelays: verifiedSfu.trustedRelays,
          relays: verifiedSfu.relays,
        });
      }
      onSaved();
    } catch (err) {
      setMetaError((err as Error).message);
    } finally {
      setSavingMeta(false);
    }
  }

  async function addMember(event?: FormEvent) {
    event?.preventDefault();
    setMemberError(null);
    let hex = newMember.trim();
    if (!hex) return;
    if (hex.startsWith('npub1')) {
      const decoded = npubToHex(hex);
      if (!decoded) {
        setMemberError('Not an npub');
        return;
      }
      hex = decoded;
    }
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      setMemberError('Provide an npub or 64-char hex pubkey');
      return;
    }
    setMemberBusy(true);
    try {
      // The regex above is case-insensitive so a pasted upper-case key is
      // accepted, but the relay compares pubkeys byte for byte: normalize.
      await nostrActions.putUser(group.id, hex.toLowerCase(), makeAdmin ? ['admin'] : []);
      setNewMember('');
      setMakeAdmin(false);
    } catch (err) {
      setMemberError((err as Error).message);
    } finally {
      setMemberBusy(false);
    }
  }

  return {
    name, about, picture, banner, access, channelKind, forumTags,
    setName, setAbout, setPicture, setBanner, setAccess, setChannelKind, setForumTags,
    savingMeta, metaError, saveMeta,
    sfuUrl, setSfuUrl, sfuChecking, sfuVerified, verifySfu,
    members, admins, adminSet, allPubkeys,
    newMember, setNewMember, makeAdmin, setMakeAdmin, memberBusy, memberError, addMember,
  };
}
