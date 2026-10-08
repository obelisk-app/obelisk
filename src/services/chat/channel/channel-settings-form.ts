import { nostrActions, type JsForumTag, type JsGroup } from '@/services/nostr-bridge';
import type { SfuEndpointInfo } from '@/services/voice/sfu-pin';
import type { FormSpec } from '@/constants/common/form';
import { accessFlags, accessOf, type ChannelAccess } from '@/utils/chat/channel/channel-access';
import { filled, parseMemberKey } from '@/utils/common/form-rules';

export type ChannelMetaValues = {
  name: string;
  about: string;
  picture: string;
  banner: string;
  access: ChannelAccess;
  kind: JsGroup['kind'];
  /**
   * The publications channel's curated tags, from the relay's metadata so
   * the admin sees the set on open, and republished in full on save because
   * NIP-29 9002 is a full replacement. A screen with no tag editor never
   * sets them, and the set survives its save.
   */
  forumTags: ReadonlyArray<JsForumTag>;
};

/** The SFU the screen holds: the URL typed, and its `/info` check (null when the check failed, having said why). */
export interface ChannelSfuCheck {
  url: string;
  verify: () => Promise<SfuEndpointInfo | null>;
}

/**
 * The channel settings metadata (kind 9002), shared by the desktop modal and
 * the phone sheet. Switching to `voice-sfu` with an SFU URL checks that SFU
 * first, so a bad URL cannot leave the channel on `voice-sfu` without a
 * usable pin; then the metadata, then the signed NIP-78 pin. Resolves `true`
 * when saved, `false` when the SFU check stopped it (its message is shown).
 */
export function channelMetaForm(group: JsGroup, sfu: ChannelSfuCheck, onSaved: () => void): FormSpec<ChannelMetaValues, boolean> {
  return {
    initial: () => ({
      name: group.name ?? '',
      about: group.about ?? '',
      picture: group.picture ?? '',
      banner: group.banner ?? '',
      access: accessOf(group),
      kind: group.kind,
      forumTags: group.forumTags,
    }),
    submit: async (values) => {
      let pin: SfuEndpointInfo | null = null;
      if (values.kind === 'voice-sfu' && filled(sfu.url)) {
        pin = await sfu.verify();
        if (!pin) return false;
      }
      await nostrActions.editGroupMetadata({
        groupId: group.id,
        name: values.name,
        about: values.about,
        picture: values.picture || undefined,
        banner: values.banner || undefined,
        ...accessFlags(values.access),
        kind: values.kind,
        // Only meaningful for publications; harmless on other kinds.
        forumTags: values.forumTags,
      });
      if (pin) {
        const { publishSfuPin } = await import('@/services/voice/sfu-pin');
        await publishSfuPin(group.id, { pubkey: pin.pubkey, url: pin.url, trustedRelays: pin.trustedRelays, relays: pin.relays });
      }
      return true;
    },
    failure: 'chat.channelSettings.saveFailed',
    onSuccess: (saved) => {
      if (saved) onSaved();
    },
  };
}

export type AddMemberValues = { key: string; admin: boolean };

/**
 * Adding a member (kind 9000) from either settings screen: an npub or a hex
 * key, optionally as an admin. The form clears after the relay accepts.
 */
export function addMemberForm(groupId: string): FormSpec<AddMemberValues> {
  return {
    initial: { key: '', admin: false },
    ready: (values) => filled(values.key),
    validate: (values) => {
      const key = parseMemberKey(values.key);
      if (key.ok) return null;
      return key.problem === 'notNpub' ? 'chat.channelSettings.notNpub' : 'chat.channelSettings.badMember';
    },
    submit: async (values) => {
      const key = parseMemberKey(values.key);
      if (key.ok) await nostrActions.putUser(groupId, key.hex, values.admin ? ['admin'] : []);
    },
    failure: 'chat.channelSettings.memberFailed',
    resetOnSuccess: true,
  };
}
