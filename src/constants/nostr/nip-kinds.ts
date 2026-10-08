/**
 * Named constants for the Nostr event kinds Obelisk publishes and consumes.
 * Centralizing these here prevents typos (the numbers look alike: 1059 vs
 * 1069 is a silent bug) and gives each kind a single place to document the
 * NIP spec it comes from.
 *
 * Keep this file the single source of truth: grep `event.kind = \d` should
 * only turn up matches inside this module.
 */

/** NIP-01: user metadata (profile). */
export const KIND_METADATA = 0;

/** NIP-01: short text note. */
export const KIND_TEXT_NOTE = 1;

/** NIP-02: contact list (follows). */
export const KIND_CONTACT_LIST = 3;

/** NIP-04: legacy encrypted direct message. Deprecated in favor of NIP-17. */
export const KIND_ENCRYPTED_DM = 4;

/** NIP-09: event deletion request. */
export const KIND_EVENT_DELETION = 5;

/** NIP-25: reaction. */
export const KIND_REACTION = 7;

/** NIP-29: group chat message. */
export const KIND_GROUP_CHAT_MESSAGE = 9;

/** NIP-29 - moderation: add a user to a group, optionally with roles (admin event). */
export const KIND_GROUP_PUT_USER = 9000;

/** NIP-29 - moderation: remove a user from a group (admin event). */
export const KIND_GROUP_REMOVE_USER = 9001;

/** NIP-29 - moderation: edit group metadata (admin event). */
export const KIND_GROUP_EDIT_METADATA = 9002;

/** NIP-29 - moderation: remove a role/permission from a user (admin event). */
export const KIND_GROUP_REMOVE_PERMISSION = 9003;

/** NIP-29 - moderation: delete an event from a group (admin event). */
export const KIND_GROUP_DELETE_EVENT = 9005;

/** NIP-29: group create (admin event). */
export const KIND_GROUP_CREATE = 9007;

/** NIP-29: user asks to join a group. */
export const KIND_GROUP_JOIN_REQUEST = 9021;

/** NIP-29: user asks to leave a group. */
export const KIND_GROUP_LEAVE_REQUEST = 9022;

/** NIP-29: group metadata (replaceable, addressable by `["d", groupId]`). */
export const KIND_GROUP_METADATA = 39000;

/** NIP-29: group admins list. */
export const KIND_GROUP_ADMINS = 39001;

/** NIP-29: group members list. */
export const KIND_GROUP_MEMBERS = 39002;

/** NIP-17: private message rumor (the inner unsigned event inside a 1059 gift wrap). */
export const KIND_DM_RUMOR = 14;

/**
 * NIP-17: file message rumor. `content` is the URL of an AES-GCM-encrypted
 * Blossom blob; key, nonce and hashes ride in tags. See `src/utils/attachments/dm-file.ts`.
 */
export const KIND_DM_FILE_RUMOR = 15;

/**
 * Obelisk DM calls: the rumor kind for call control (invite / accept /
 * decline / cancel / hangup / busy). Never on the wire in the clear: it only
 * ever travels sealed and gift-wrapped like a kind 14, so a relay sees an
 * ordinary kind 1059. The WebRTC negotiation that follows runs on per-call
 * throwaway keys (kind 25050, NIP-44 content); see docs/features/voice/dm-calls.md.
 */
export const KIND_DM_CALL_RUMOR = 25055;

/** NIP-59: seal (kind 13), the inner signed event between rumor and gift wrap. */
export const KIND_SEAL = 13;

/** NIP-51: mute list (replaceable). */
export const KIND_MUTE_LIST = 10000;

/** NIP-65: relay list metadata (user's preferred relays). */
export const KIND_RELAY_LIST = 10002;

/** NIP-17: DM inbox relays. */
export const KIND_DM_INBOX_RELAYS = 10050;

/** NIP-51: user's preferred emojis and referenced emoji/media packs. */
export const KIND_EMOJI_FAVORITES = 10030;

/** NIP-51 / NIP-30: addressable custom emoji set. */
export const KIND_EMOJI_SET = 30030;

/** NIP-59: gift-wrapped event, transport for NIP-17 DMs. */
export const KIND_GIFT_WRAP = 1059;

/** NIP-42: client authentication to a relay (the AUTH response). */
export const KIND_CLIENT_AUTH = 22242;

/** NIP-46: Nostr Connect request/response (bunker signer protocol). */
export const KIND_NOSTR_CONNECT = 24133;

/**
 * NIP-78: application-specific replaceable parameterized event. Obelisk
 * stores channel layout, relay branding, encrypted multi-device read state,
 * and per-channel SFU pins under this kind, distinguished by their `d` tag.
 */
export const KIND_NIP78_APP_DATA = 30078;

/** BUD-01: Blossom auth event for media server uploads. */
export const KIND_BLOSSOM_AUTH = 24242;

/** NIP-98: HTTP auth event (used by backend challenge/response). */
export const KIND_HTTP_AUTH = 27235;

/**
 * Obelisk voice: ephemeral presence beacon for voice-channel rosters.
 * Re-published every ~15s while a peer is in a voice channel; tagged with
 * `["e", channelId]` and `["expiration", now+30]` so any compliant relay
 * drops it shortly after the peer leaves. See docs/features/voice/mesh-protocol.md.
 */
export const KIND_VOICE_PRESENCE = 20078;

/**
 * Obelisk voice: signaling event (offer / answer / ICE / bye) directed at a
 * specific peer via `["p", recipientPubkey]`. v1 ships these as plaintext
 * signed ephemeral events (kind in 2xxxx range, relays don't persist): the
 * channel id and recipient are already public to relay subscribers, and SDP
 * payloads aren't privacy-sensitive. Future versions may upgrade to NIP-59
 * gift-wrapped rumors once we have a NIP-07-compatible NIP-44 path.
 */
export const KIND_VOICE_SIGNAL = 25050;

/**
 * Obelisk voice: moderator force action (mute / camera-off / screen-off)
 * targeting another participant. Same plaintext-ephemeral wire as
 * `KIND_VOICE_SIGNAL`; receivers verify the signer's pubkey is a channel
 * admin/owner before acting on it.
 */
export const KIND_VOICE_MOD_ACTION = 25051;

/**
 * Obelisk SFU: control event addressed to an SFU pubkey via `["p", sfu]`.
 * Carries `{action, params}` JSON in content; `action` is one of
 * `start | end | reset | drain`. Authorization is the SFU's job: arrival
 * via a trusted-author relay (the relay's write-whitelist is the auth)
 * OR pubkey listed in the SFU's local allow.json. See docs/features/sfu-system.md.
 */
export const KIND_SFU_CONTROL = 25052;

/**
 * Obelisk SFU: replaceable advertisement (kind 31313) published by every
 * running SFU on its general relays. Tags carry `url`, `relay`,
 * `trusted_relay`, `cap`, `version`, `operator`, `codec`. Voice clients
 * read this to discover which SFU to address kind 25052 at when the user
 * joins a `voice-sfu` channel.
 */
export const KIND_SFU_ADVERTISE = 31313;

/**
 * Obelisk SFU: replaceable active-call announcement (kind 31314) published
 * by the SFU once a room has accepted a `start`. Tagged with `d=<channelId>`
 * so it replaces previous status for the same channel, plus
 * `host=<hostPubkey>`, `status=<active|closed>` and `expiration=<unix>`.
 * The bridge subscribes to it (`subscribeActiveCalls`) so the sidebar and
 * channel headers can show a "LIVE" badge to users who are not in the call.
 */
export const KIND_SFU_ACTIVE_CALL = 31314;

/**
 * Obelisk games: every turn-based game event (create / join / start / move /
 * timeout / resign / cancel) rides this single stored kind, scoped to a
 * channel with `["h", channelId]` and to a table with `["e", gameId]`.
 *
 * Why a stored (regular) kind and not the ephemeral 25xxx voice signaling
 * uses: a game's state IS its event log. A player who opens the tab
 * mid-match replays the log through the pure engine to rebuild the board,
 * so the relay has to keep the events. Voice signaling can be ephemeral
 * because SDP is worthless a second after it's sent.
 *
 * 2390 sits in the regular range (1000-9999, relays persist) and is
 * unclaimed by any NIP; 2003/2004 (torrents) are the nearest neighbours.
 * See docs/features/games.md for the wire format.
 */
export const KIND_GAME = 2390;

/**
 * Nostr Wallet Connect (NIP-47): the wallet service's info event (13194,
 * replaceable: its methods and encryption), a client's request (23194) and
 * the wallet's answer (23195), both ephemeral. The protocol itself lives in
 * `@nostr-wot/wallet/nwc` (its `NWC_KINDS` contract is pinned
 * equal to these by `tests/services/wallet/nwc-contract.test.ts`). See docs/features/bitcoin-zaps-nwc.md.
 */
export const KIND_NWC_INFO = 13194;
export const KIND_NWC_REQUEST = 23194;
export const KIND_NWC_RESPONSE = 23195;

/**
 * The social feed's kinds (`src/services/social/kinds.ts` says which of them
 * a feed requests and how each renders): reposts and generic reposts
 * (NIP-18), zap receipts (NIP-57), pictures, videos and short videos
 * (NIP-68, NIP-71), highlights (NIP-84), long-form articles (NIP-23) and
 * comments (NIP-22).
 */
export const KIND_REPOST = 6;
export const KIND_GENERIC_REPOST = 16;
export const KIND_ZAP_RECEIPT = 9735;
export const KIND_PICTURE = 20;
export const KIND_VIDEO = 21;
export const KIND_SHORT_VIDEO = 22;
export const KIND_HIGHLIGHT = 9802;
export const KIND_LONG_FORM = 30023;
export const KIND_COMMENT = 1111;

/** NIP-94 file metadata; the media lives in tags, not the content. */
export const KIND_FILE_METADATA = 1063;

/** NIP-51 interests list. Replaceable, one per author. */
export const KIND_INTERESTS = 10015;

/** NIP-51 follow sets (30000) and the starter packs (39089) the social tier reads. */
export const KIND_STARTER_PACK = 39089;
export const KIND_FOLLOW_SET = 30000;
