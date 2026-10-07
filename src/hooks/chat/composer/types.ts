import type { ClipboardEvent, FormEvent, KeyboardEvent, RefObject } from 'react';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';
import type { MemberInfo } from '@/utils/message-text/mentions';
import type { CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import type { MessageVoiceNote } from '@/utils/media/tags/voice-note-tags';
import type { SlashFilter, SlashSection } from '@/services/relay/bot-commands';
import type { BotProfiles, SlashCommand } from '@/components/chat/slash/SlashCommandAutocomplete';
import type { MediaPickerTab } from '@/components/chat/picker/MessageMediaPicker';
import type { PickedCustomEmoji } from '@/components/chat/picker/EmojiPicker';

/**
 * What a panel-level drop zone needs from the composer it wraps: the drop
 * target covers the whole message area, but the upload belongs to the
 * composer, so the skin exposes this through a ref.
 */
export interface ComposerHandle {
  readonly pickFiles: (files: File[]) => void;
}

/** Cap on inline attachments; matches the gallery's 2x2 matrix renderer. */
export const MAX_COMPOSER_ATTACHMENTS = 4;

export interface ChannelComposerOptions {
  readonly groupId: string;
  /** Raw lookup of the channel (may be null until kind 39000 lands). */
  readonly group: JsGroup | null;
  /** The channel's loaded messages, for `/zap` target resolution. */
  readonly messages: ReadonlyArray<JsMessage>;
  readonly replyingTo: JsMessage | null;
  readonly setReplyingTo: (message: JsMessage | null) => void;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  /** `/play` opens the table picker; the modal itself belongs to the skin. */
  readonly onOpenNewGame: () => void;
  /** How many rows the mention picker shows (desktop 8, phone 6). */
  readonly maxMentionResults?: number;
}

export interface ChannelComposer {
  // Draft
  readonly draft: string;
  readonly setDraft: (value: string) => void;
  readonly caret: number;
  /** Controlled input change: updates the draft, drops sticker/voice state, re-runs mention and slash detection. */
  readonly onInput: (value: string, cursor: number) => void;
  /** Caret moved without the text changing: re-run detection only. */
  readonly onSelect: (value: string, cursor: number) => void;
  /** Arrow/Enter/Tab/Escape inside the mention or slash picker; Enter sends when `submitOnEnter`. */
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>, submitOnEnter?: boolean) => void;
  /** Pasted image/video files become attachments. */
  readonly onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
  readonly send: (event?: FormEvent) => Promise<void>;
  readonly sendError: string | null;

  // Attachments, media, voice
  readonly uploading: boolean;
  readonly onPickFiles: (files: File[]) => Promise<void>;
  readonly onVoiceRecorded: (file: File, durationSeconds: number) => Promise<void>;
  readonly draftVoiceNote: MessageVoiceNote | null;
  readonly discardVoiceNote: () => void;
  readonly onContact: (value: string) => void;
  /** Image URLs currently inline in the draft (max 4), for the attachment strip. */
  readonly pendingImageUrls: ReadonlyArray<string>;
  readonly removeAttachmentUrl: (url: string) => void;
  readonly emojiOpen: boolean;
  readonly setEmojiOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  readonly pickerTab: MediaPickerTab;
  readonly openPicker: (tab: MediaPickerTab) => void;
  /** Server emojis merged with the custom ones already in the draft, for the picker. */
  readonly pickerEmojis: CustomEmojiMap;
  readonly onPickMedia: (emoji: string, custom?: PickedCustomEmoji, kind?: MediaPickerTab) => void;

  // Mentions
  readonly mentionQuery: string | null;
  readonly mentionIndex: number;
  readonly setMentionIndex: (index: number) => void;
  readonly filteredMembers: MemberInfo[];
  readonly applyMention: (member: MemberInfo) => void;
  readonly closeMentions: () => void;

  // Slash commands
  readonly slashQuery: string | null;
  readonly slashIndex: number;
  readonly slashSections: SlashSection[];
  readonly slashRail: SlashSection[];
  readonly slashResults: SlashCommand[];
  readonly slashFilter: SlashFilter;
  readonly setSlashFilter: (filter: SlashFilter) => void;
  readonly botProfiles: BotProfiles;
  readonly activeSlashCommand: SlashCommand | null;
  readonly insertSlashCommand: (command: SlashCommand) => void;
  readonly closeSlash: () => void;
}
