/**
 * Promise-returning action wrappers around the bridge. Components import
 * from here instead of touching getBridge() directly.
 */
import { getBridge } from './client';

export const nostrActions = {
  loginWithNsec: async (privKeyHex: string, pubKeyHex: string) =>
    (await getBridge()).loginWithNsec(privKeyHex, pubKeyHex),

  loginWithNip07: async (pubkeyHex: string) =>
    (await getBridge()).loginWithNip07(pubkeyHex),

  loginWithBunker: async (bunkerUrl: string) =>
    (await getBridge()).loginWithBunker(bunkerUrl),

  logout: async () => (await getBridge()).logout(),

  connect: async () => (await getBridge()).connect(),
  switchRelay: async (url: string) => (await getBridge()).switchRelay(url),
  addRelay: async (url: string) => (await getBridge()).addRelay(url),
  removeRelay: async (url: string) => (await getBridge()).removeRelay(url),

  sendMessage: async (groupId: string, content: string) =>
    (await getBridge()).sendMessage(groupId, content),
  sendReaction: async (targetEventId: string, targetPubkey: string, emoji: string, groupId: string) =>
    (await getBridge()).sendReaction(targetEventId, targetPubkey, emoji, groupId),
  sendDirectMessage: async (recipientPubkey: string, content: string) =>
    (await getBridge()).sendDirectMessage(recipientPubkey, content),
  joinGroup: async (groupId: string) => (await getBridge()).joinGroup(groupId),
  leaveGroup: async (groupId: string) => (await getBridge()).leaveGroup(groupId),
  createGroup: async (opts: Parameters<Awaited<ReturnType<typeof getBridge>>['createGroup']>[0]) =>
    (await getBridge()).createGroup(opts),
  editGroupMetadata: async (
    opts: Parameters<Awaited<ReturnType<typeof getBridge>>['editGroupMetadata']>[0],
  ) => (await getBridge()).editGroupMetadata(opts),
  putUser: async (groupId: string, pubkey: string, roles?: ReadonlyArray<string>) =>
    (await getBridge()).putUser(groupId, pubkey, roles),
  removeUser: async (groupId: string, pubkey: string) =>
    (await getBridge()).removeUser(groupId, pubkey),
  deleteGroupEvent: async (groupId: string, eventId: string) =>
    (await getBridge()).deleteGroupEvent(groupId, eventId),
  loadMoreMessages: async (groupId: string) =>
    (await getBridge()).loadMoreMessages(groupId),

  markGroupAsRead: async (groupId: string) =>
    (await getBridge()).markGroupAsRead(groupId),
  setActiveGroup: async (groupId: string | null) =>
    (await getBridge()).setActiveGroup(groupId),
  ensureUserMetadata: async (pubkey: string) =>
    (await getBridge()).ensureUserMetadata(pubkey),
};
