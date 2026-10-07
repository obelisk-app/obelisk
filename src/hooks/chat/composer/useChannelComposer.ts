'use client';

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import {
  applyMentionToDraft,
  detectMentionQuery,
  type DraftMention,
  type MemberInfo,
} from '@/utils/message-text/mentions';
import { mergeCustomEmojiMaps, type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import type { MessageSticker } from '@/utils/media/tags/sticker-tags';
import type { MessageVoiceNote } from '@/utils/media/tags/voice-note-tags';
import { extractUrls, isImageUrl } from '@/utils/message-text/markdown';
import { useChatStore } from '@/store/chat';
import { slashCommandId, type SlashFilter } from '@/services/relay/bot-commands';
import { pushRecentSlashCommand } from '@/services/chat/slash/recent-slash-commands';
import type { SlashCommand } from '@/utils/chat/slash/slash-commands';
import { scaffoldMentionSlotQuery, scaffoldMentionSlotRange } from '@/utils/chat/slash/slash-scaffold';
import type { MediaPickerTab } from '@/utils/chat/picker/media-catalog';
import type { PickedCustomEmoji } from '@/utils/chat/picker/picker-types';
import {
  builtinCommandOf,
  pastedMediaFiles,
  removeUrlLine,
  slashQueryOf,
  withPickedMedia,
} from '@/utils/chat/composer/draft-text';
import { navigatePicker } from '@/utils/chat/composer/picker-keys';
import { type ChannelComposer, type ChannelComposerOptions } from './types';
import { MAX_COMPOSER_ATTACHMENTS } from '@/constants/chat/composer';
import { useComposerMetadata, useMentionCandidates } from './useComposerPeople';
import { useComposerSend } from './useComposerSend';
import { useComposerUploads } from './useComposerUploads';
import { useSlashCatalog } from './useSlashCatalog';

export type { ChannelComposer, ChannelComposerOptions, ComposerHandle } from './types';

/**
 * The channel composer, headless: draft, attachments, stickers, voice
 * notes, @-mentions, slash commands and `send`. `ChatPanel` (desktop) and
 * `ChannelScreen` (phone) each carried this; the phone copy had drifted
 * behind desktop on three points, which the single implementation closes:
 *
 * - `/zap` is a frontend-only command that opens the zap modal.
 * - On an open group the first message waits for the NIP-29 join request,
 *   so browser extensions never receive two signature requests at once,
 *   and a rejected join keeps the draft.
 * - Upload failures land in `sendError` for the skin to show, instead of
 *   `console.warn`.
 *
 * Focus after a mention insert is restored synchronously (inside the tap's
 * user-activation task, or mobile browsers refuse to reopen the keyboard);
 * the caret waits for the controlled value to flush in a layout effect.
 *
 * The pieces live in `./composer/`: the people and slash catalogs, uploads,
 * `send`, picker keys and the pure draft-text rules. This file keeps the draft
 * state and the wiring between them, and its name and return shape.
 */
export function useChannelComposer({
  groupId,
  group,
  messages,
  replyingTo,
  setReplyingTo,
  inputRef,
  onOpenNewGame,
  maxMentionResults = 8,
}: ChannelComposerOptions): ChannelComposer {
  const relay = useCurrentRelayUrl();
  const serverEmojis = useChatStore((s) => s.serverEmojis);

  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<MediaPickerTab>('emoji');
  const [draftCustomEmojis, setDraftCustomEmojis] = useState<CustomEmojiMap>({});
  const [draftSticker, setDraftSticker] = useState<MessageSticker | null>(null);
  const [draftVoiceNote, setDraftVoiceNote] = useState<MessageVoiceNote | null>(null);
  /**
   * Mentions the draft is holding as readable `@Name` text, resolved back to
   * `nostr:npub1...` in `send`. Slash-command slots are not tracked here;
   * those already carry the npub.
   */
  const [draftMentions, setDraftMentions] = useState<DraftMention[]>([]);
  /** Caret owed to the input once a mention or command insert re-renders. */
  const pendingCaretRef = useRef<number | null>(null);
  const { uploading, onPickFiles, onVoiceRecorded } = useComposerUploads({
    setDraft, setDraftSticker, setDraftVoiceNote, setSendError,
  });

  const metaMap = useComposerMetadata();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const filteredMembers = useMentionCandidates(mentionQuery, metaMap, maxMentionResults);

  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const {
    slashSections, slashRail, slashResults, slashFilter, setSlashFilterState, setRecentSlash, botProfiles,
  } = useSlashCatalog(relay, slashQuery, metaMap);
  const activeSlashCommand = useMemo<SlashCommand | null>(() => builtinCommandOf(draft), [draft]);

  // Stale @-state or slash state from a previous channel must not bleed into
  // a fresh composer. Reset in the render that first sees the new channel
  // (the previous-value pattern), not one commit later.
  const [composerGroupId, setComposerGroupId] = useState(groupId);
  if (composerGroupId !== groupId) {
    setComposerGroupId(groupId);
    setMentionQuery(null);
    setSlashQuery(null);
    setDraftMentions([]);
    setSendError(null);
  }

  // Park the caret after an insert until React has flushed the new
  // controlled value; setting it before that would clamp against the old,
  // shorter draft.
  useLayoutEffect(() => {
    const next = pendingCaretRef.current;
    if (next === null) return;
    pendingCaretRef.current = null;
    inputRef.current?.setSelectionRange(next, next);
    setCaret(next);
  }, [draft, inputRef]);

  function detect(value: string, cursor: number) {
    setCaret(cursor);
    const sq = slashQueryOf(value);
    if (sq !== null) {
      if (slashQuery === null) setSlashFilterState('all');
      setSlashQuery(sq);
      setSlashIndex(0);
      setMentionQuery(null);
      return;
    }
    setSlashQuery(null);
    if (builtinCommandOf(value)) {
      const slot = scaffoldMentionSlotQuery(value, cursor);
      if (slot !== null) {
        setMentionQuery(slot);
        setMentionIndex(0);
        return;
      }
    }
    const query = detectMentionQuery(value, cursor);
    if (query !== mentionQuery) {
      setMentionQuery(query);
      if (query !== null) setMentionIndex(0);
    }
  }

  function onInput(value: string, cursor: number) {
    setDraft(value);
    setDraftSticker(null);
    setDraftVoiceNote(null);
    detect(value, cursor);
  }

  function focusAndPlaceCaret(position: number) {
    // Focus MUST be restored synchronously, inside the tap's user-activation
    // task: deferred to a later task, mobile browsers refuse to reopen the
    // soft keyboard and the keyboard-inset layout collapses.
    inputRef.current?.focus({ preventScroll: true });
    pendingCaretRef.current = position;
  }

  function insertSlashCommand(cmd: SlashCommand) {
    // Bot commands insert what the bot parses (`!milugar`), not `/milugar`.
    const next = `${cmd.insert ?? `/${cmd.name}`} `;
    setRecentSlash(pushRecentSlashCommand(slashCommandId(cmd)));
    setDraft(next);
    setSlashQuery(null);
    focusAndPlaceCaret(next.length);
  }

  function applyMention(member: MemberInfo) {
    const cursor = inputRef.current?.selectionStart ?? draft.length;
    // When the picker is opened by a slash-command slot, replace whatever
    // partial token the user already typed (`/zap dum` -> the `dum` token)
    // instead of appending another mention token after it. Slot mentions
    // stay `nostr:npub1...` because those slots are whitespace tokenized;
    // prose mentions become readable `@Name` and are resolved on send.
    const slotRange = scaffoldMentionSlotRange(draft, cursor);
    const { next, cursor: nextCursor, mention } = applyMentionToDraft(
      draft,
      cursor,
      member.pubkey,
      { displayName: member.displayName, slotRange },
    );
    setDraft(next);
    if (mention) setDraftMentions((prev) => [...prev, mention]);
    setMentionQuery(null);
    focusAndPlaceCaret(nextCursor);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, submitOnEnter = false) {
    if (navigatePicker(e, {
      open: slashQuery !== null,
      count: slashResults.length,
      setIndex: setSlashIndex,
      choose: () => insertSlashCommand(slashResults[slashIndex]),
      close: () => setSlashQuery(null),
    })) return;
    if (navigatePicker(e, {
      open: mentionQuery !== null,
      count: filteredMembers.length,
      setIndex: setMentionIndex,
      choose: () => applyMention(filteredMembers[mentionIndex]),
      close: () => setMentionQuery(null),
    })) return;
    if (submitOnEnter && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const files = pastedMediaFiles(Array.from(e.clipboardData?.items ?? []));
    if (files.length > 0) {
      e.preventDefault();
      void onPickFiles(files);
    }
  }

  function onPickMedia(emoji: string, custom?: PickedCustomEmoji, kind?: MediaPickerTab) {
    setDraft((current) => withPickedMedia(current, emoji, kind));
    setDraftSticker(kind === 'sticker' && custom ? custom : null);
    setDraftVoiceNote(null);
    if (custom) setDraftCustomEmojis((current) => ({ ...current, [custom.name]: custom.url }));
    setEmojiOpen(false);
  }

  const pendingImageUrls = useMemo(
    () => extractUrls(draft).filter(isImageUrl).slice(0, MAX_COMPOSER_ATTACHMENTS),
    [draft],
  );
  const send = useComposerSend({
    groupId, group, relay, messages, replyingTo, setReplyingTo, onOpenNewGame,
    state: {
      draft, setDraft, setSendError, draftMentions, setDraftMentions, serverEmojis,
      draftCustomEmojis, setDraftCustomEmojis, draftSticker, setDraftSticker, draftVoiceNote, setDraftVoiceNote,
    },
  });
  const pickerEmojis = useMemo(
    () => mergeCustomEmojiMaps(serverEmojis, draftCustomEmojis),
    [serverEmojis, draftCustomEmojis],
  );

  const setSlashFilter = useCallback((filter: SlashFilter) => {
    setSlashFilterState(filter);
    setSlashIndex(0);
  }, [setSlashFilterState]);

  return {
    draft, setDraft, caret, onInput, onSelect: detect, onKeyDown, onPaste, send, sendError,
    uploading, onPickFiles, onVoiceRecorded, draftVoiceNote,
    discardVoiceNote: () => { setDraft(''); setDraftVoiceNote(null); },
    onContact: (value: string) => {
      setDraftSticker(null);
      setDraftVoiceNote(null);
      setDraft((current) => current + (current ? ' ' : '') + 'nostr:' + value);
    },
    pendingImageUrls,
    removeAttachmentUrl: (url: string) => setDraft((d) => removeUrlLine(d, url)),
    emojiOpen, setEmojiOpen,
    pickerTab,
    openPicker: (tab: MediaPickerTab) => { setPickerTab(tab); setEmojiOpen(true); },
    pickerEmojis, onPickMedia,
    mentionQuery, mentionIndex, setMentionIndex, filteredMembers, applyMention,
    closeMentions: () => setMentionQuery(null),
    slashQuery, slashIndex, slashSections, slashRail, slashResults, slashFilter, setSlashFilter,
    botProfiles, activeSlashCommand, insertSlashCommand,
    closeSlash: () => setSlashQuery(null),
  };
}
