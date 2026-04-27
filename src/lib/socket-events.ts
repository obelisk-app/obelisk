/**
 * Event-name constants for the Socket.io traffic between `server.ts` and the
 * client subscribers in `src/app/chat/page.tsx` (plus the API-route emitters
 * that reach into `io` to broadcast state updates).
 *
 * Why: a typo on either side is silent — the listener just never fires, the
 * emitter just never reaches anyone. Centralizing the strings here means any
 * rename is a compile error at every call site.
 *
 * Built-in Socket.io lifecycle events (`connect`, `disconnect`, `connection`,
 * `connect_error`, `reconnect_attempt`) are intentionally NOT included — they
 * are provided by the library, not by us.
 */

/** Events the server sends to clients (`io.emit`, `socket.emit` in server.ts). */
export const ServerToClient = {
  // Chat
  NewMessage: 'new-message',
  MessageEdited: 'message-edited',
  MessageDeleted: 'message-deleted',
  MessageError: 'message-error',
  MessagePinned: 'message-pinned',
  ReactionUpdated: 'reaction-updated',
  UserTyping: 'user-typing',
  DMUserTyping: 'dm-user-typing',

  // Presence & unread
  PresenceUpdate: 'presence-update',
  Notification: 'notification',
  PostUnread: 'post-unread',
  PostSubscribed: 'post-subscribed',
  UnreadUpdate: 'unread-update',
  ReadUpdate: 'read-update',
  DMReadUpdate: 'dm-read-update',
  MentionReadUpdate: 'mention-read-update',
  BotUpdated: 'bot-updated',
  ForceDisconnect: 'force-disconnect',

  // Voice
  VoicePeerJoined: 'voice-peer-joined',
  VoicePeerLeft: 'voice-peer-left',
  VoiceStateUpdate: 'voice-state-update',
  VoiceSignal: 'voice-signal',
  // These start life as ClientToServer events but the server re-broadcasts
  // them to peers in the voice channel, so clients also listen for them.
  VoiceVideoStart: 'voice-video-start',
  VoiceVideoStop: 'voice-video-stop',
  VoiceScreenStart: 'voice-screen-start',
  VoiceScreenStop: 'voice-screen-stop',

  // Games & wallet
  GameCreated: 'game-created',
  GameUpdated: 'game-updated',
  GameFinished: 'game-finished',
  GameTurn: 'game-turn',
  InvoicePaid: 'invoice-paid',
} as const;

/** Events clients send to the server (`socket.emit` on the browser side). */
export const ClientToServer = {
  // Rooms
  JoinChannel: 'join-channel',
  LeaveChannel: 'leave-channel',
  JoinServer: 'join-server',
  LeaveServer: 'leave-server',

  // Chat actions
  SendMessage: 'send-message',
  EditMessage: 'edit-message',
  DeleteMessage: 'delete-message',
  ToggleReaction: 'toggle-reaction',
  Typing: 'typing',
  DMTyping: 'dm-typing',
  DMRead: 'dm-read',
  MarkRead: 'mark-read',
  MarkMentionRead: 'mark-mention-read',
  PresenceSync: 'presence-sync',

  // Voice (client → server signaling + moderation)
  JoinVoice: 'join-voice',
  LeaveVoice: 'leave-voice',
  VoiceMute: 'voice-mute',
  VoiceDeafen: 'voice-deafen',
  VoiceVideoStart: 'voice-video-start',
  VoiceVideoStop: 'voice-video-stop',
  VoiceCameraClaim: 'voice-camera-claim',
  VoiceCameraRelease: 'voice-camera-release',
  VoiceScreenClaim: 'voice-screen-claim',
  VoiceScreenRelease: 'voice-screen-release',
  VoiceScreenStart: 'voice-screen-start',
  VoiceScreenStop: 'voice-screen-stop',
  VoiceForceMute: 'voice-force-mute',
  VoiceForceCameraOff: 'voice-force-camera-off',
  VoiceForceScreenOff: 'voice-force-screen-off',
  VoiceModAction: 'voice-mod-action',
  VoiceSignal: 'voice-signal',
} as const;
