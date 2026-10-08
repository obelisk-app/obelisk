/**
 * Promise-returning action wrappers around the bridge. Components import
 * from here instead of touching getBridge() directly.
 */
import { getBridge } from './client';
import type { JsSearchOptions, JsSearchResponse } from '../common/types';
import type { JsDmFile } from '@/utils/attachments/dm-file';

export const nostrActions = {
  connect: async () => (await getBridge()).connect(),
  switchRelay: async (url: string) => (await getBridge()).switchRelay(url),
  addRelay: async (url: string) => (await getBridge()).addRelay(url),
  removeRelay: async (url: string) => (await getBridge()).removeRelay(url),

  saveMediaPack: async (pack: Parameters<Awaited<ReturnType<typeof getBridge>>['saveMediaPack']>[0]) =>
    (await getBridge()).saveMediaPack(pack),
  deleteMediaPack: async (address: string) => (await getBridge()).deleteMediaPack(address),
  saveMediaFavorites: async (favorites: Parameters<Awaited<ReturnType<typeof getBridge>>['saveMediaFavorites']>[0]) =>
    (await getBridge()).saveMediaFavorites(favorites),

  sendMessage: async (
    groupId: string,
    content: string,
    replyTo?: { id: string; pubkey: string } | null,
    emojiTags?: ReadonlyArray<ReadonlyArray<string>>,
  ) => (await getBridge()).sendMessage(groupId, content, replyTo, emojiTags),
  sendReaction: async (
    targetEventId: string,
    targetPubkey: string,
    emoji: string,
    groupId: string,
    emojiTags?: ReadonlyArray<ReadonlyArray<string>>,
  ) => (await getBridge()).sendReaction(targetEventId, targetPubkey, emoji, groupId, emojiTags),
  removeReaction: async (groupId: string, reactionEventId: string) =>
    (await getBridge()).removeReaction(groupId, reactionEventId),
  removeMessage: async (groupId: string, eventId: string) =>
    (await getBridge()).removeMessage(groupId, eventId),
  sendDirectMessage: async (recipientPubkey: string, content: string, extraTags?: string[][]) =>
    (await getBridge()).sendDirectMessage(recipientPubkey, content, extraTags),
  retryMessage: async (groupId: string, clientTag: string) =>
    (await getBridge()).retryMessage(groupId, clientTag),
  sendDirectFile: async (recipientPubkey: string, file: JsDmFile) =>
    (await getBridge()).sendDirectFile(recipientPubkey, file),
  retryDirectMessage: async (counterparty: string, clientTag: string) =>
    (await getBridge()).retryDirectMessage(counterparty, clientTag),
  cancelPendingMessage: async (groupId: string, clientTag: string) =>
    (await getBridge()).cancelPendingMessage(groupId, clientTag),
  cancelPendingDirectMessage: async (counterparty: string, clientTag: string) =>
    (await getBridge()).cancelPendingDirectMessage(counterparty, clientTag),
  /** Settings > Data on this device: stop the encrypted DM store writing before its database goes. */
  forgetDirectMessages: async () => (await getBridge()).forgetDirectMessages(),
  joinGroup: async (groupId: string) => (await getBridge()).joinGroup(groupId),
  leaveGroup: async (groupId: string) => (await getBridge()).leaveGroup(groupId),
  createGroup: async (opts: Parameters<Awaited<ReturnType<typeof getBridge>>['createGroup']>[0]) =>
    (await getBridge()).createGroup(opts),
  editGroupMetadata: async (
    opts: Parameters<Awaited<ReturnType<typeof getBridge>>['editGroupMetadata']>[0],
  ) => (await getBridge()).editGroupMetadata(opts),
  putUser: async (
    groupId: string,
    pubkey: string,
    roles?: ReadonlyArray<string>,
    opts?: { quiet?: boolean },
  ) => (await getBridge()).putUser(groupId, pubkey, roles, opts),
  removeUser: async (groupId: string, pubkey: string) =>
    (await getBridge()).removeUser(groupId, pubkey),
  removePermission: async (
    groupId: string,
    pubkey: string,
    permissions: ReadonlyArray<string>,
  ) => (await getBridge()).removePermission(groupId, pubkey, permissions),
  claimCreatorAdmin: async (groupId: string) =>
    (await getBridge()).claimCreatorAdmin(groupId),
  deleteGroupEvent: async (groupId: string, eventId: string) =>
    (await getBridge()).deleteGroupEvent(groupId, eventId),
  loadMoreMessages: async (groupId: string) =>
    (await getBridge()).loadMoreMessages(groupId),
  refreshGroupMessages: async (groupId: string) =>
    (await getBridge()).refreshGroupMessages(groupId),
  fetchGroupMetadata: async (groupId: string) =>
    (await getBridge()).fetchGroupMetadata(groupId),

  setActiveGroup: async (groupId: string | null) =>
    (await getBridge()).setActiveGroup(groupId),
  ensureUserMetadata: async (pubkey: string) =>
    (await getBridge()).ensureUserMetadata(pubkey),
  searchMessages: async (opts: JsSearchOptions): Promise<JsSearchResponse> =>
    (await getBridge()).searchMessages(opts),
  exportAccountData: async () => (await getBridge()).exportAccountData(),

  setMuted: async (pubkey: string, muted: boolean) =>
    (await getBridge()).setMuted(pubkey, muted),

  signEventTemplate: async (
    template: Parameters<Awaited<ReturnType<typeof getBridge>>['signEventTemplate']>[0],
  ) => (await getBridge()).signEventTemplate(template),
};
