'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useChatStore } from '@/store/chat';
import {
  filterMembers,
  serializeMention,
  contentToDisplayTokens,
  displayTokensToContent,
  shortNpub,
  MemberInfo,
} from '@/lib/mentions';
import MentionAutocomplete from './MentionAutocomplete';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';
import EmojiAutocomplete, { type ShortcodeSuggestion } from './EmojiAutocomplete';
import SlashCommandAutocomplete, { SLASH_COMMANDS, type SlashCommand } from './SlashCommandAutocomplete';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  splitContentForEditing,
  type PendingAttachment,
} from '@/lib/attachments';
import { searchShortcodes } from '@/lib/emoji-shortcodes';
import { canWriteInChannel, hasRole } from '@/lib/roles';

interface MessageInputProps {
  onSend: (content: string, replyToId?: string) => void;
  onEditSave?: (messageId: string, content: string) => void;
  onTyping?: () => void;
}

export default function MessageInput({ onSend, onEditSave, onTyping }: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    activeChannelId,
    activeServerId,
    pinnedChannels,
    categories,
    replyingTo,
    setReplyingTo,
    editingMessage,
    setEditingMessage,
    memberList,
    serverEmojis,
    serverGifs,
    myRole,
  } = useChatStore();

  // Attach menu / upload / emoji / gif state
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  // Drag & drop overlay state. Tracks drag enter/leave via a counter because
  // dragenter/leave fires on every child element — counting avoids flicker
  // as the pointer crosses internal elements.
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  // Any upload currently in flight (derived from chip state so parallel
  // XHRs finishing out of order can't desync a boolean flag).
  const uploading = useMemo(() => attachments.some((a) => a.uploading), [attachments]);

  // Map from display-token (e.g. "@Alice") to canonical raw token
  // ("nostr:npub1<hex>"). Populated whenever we insert/load a mention, drained
  // inside `buildPayload` to re-serialize on submit. A ref (not state) because
  // it never needs to trigger a re-render — only used on submit.
  const mentionMapRef = useRef<Map<string, string>>(new Map());

  // Compute the next unused display token for a newly-inserted mention,
  // taking into account both the existing map (so re-inserting the same user
  // collides on `#2`) and manually-typed text that happens to match.
  const nextDisplayToken = (member: MemberInfo): string => {
    const baseName = member.displayName || shortNpub(member.pubkey);
    let candidate = `@${baseName}`;
    let n = 2;
    while (mentionMapRef.current.has(candidate)) {
      candidate = `@${baseName}#${n++}`;
    }
    return candidate;
  };

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionResults = useMemo(
    () => mentionQuery !== null ? filterMembers(memberList, mentionQuery).slice(0, 8) : [],
    [memberList, mentionQuery]
  );

  // Admin+ can trigger `@everyone` — show the synthetic autocomplete row
  // when the user types `@` (empty query) or any prefix of `everyone`.
  const canBroadcastEveryone = hasRole(myRole ?? 'member', 'mod');
  const showEveryone =
    canBroadcastEveryone &&
    mentionQuery !== null &&
    (mentionQuery === '' || 'everyone'.startsWith(mentionQuery.toLowerCase()));
  const mentionListLength = mentionResults.length + (showEveryone ? 1 : 0);

  // Shortcode (`:name:`) autocomplete state — parallel to mention state
  const [shortcodeQuery, setShortcodeQuery] = useState<string | null>(null);
  const [shortcodeIndex, setShortcodeIndex] = useState(0);
  const shortcodeResults = useMemo<ShortcodeSuggestion[]>(
    () => shortcodeQuery !== null ? searchShortcodes(shortcodeQuery, serverEmojis, 8) : [],
    [shortcodeQuery, serverEmojis],
  );

  // Slash-command autocomplete — triggered when the entire input (trimmed
  // of trailing space) is `/…` with only word chars after the slash.
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashResults = useMemo<SlashCommand[]>(
    () => slashQuery === null ? [] : SLASH_COMMANDS.filter((c) => c.name.startsWith(slashQuery.toLowerCase())),
    [slashQuery],
  );

  const allChannels = [
    ...pinnedChannels,
    ...categories.flatMap(c => c.channels),
  ];
  const activeChannel = allChannels.find(c => c.id === activeChannelId);

  // Channel write-permission gate. When the channel is locked to a role the
  // current user doesn't meet, disable the composer with an explanatory
  // placeholder. Server-side enforcement in the POST handlers is the real
  // gate — this is UX only.
  const writePermission = activeChannel?.writePermission ?? null;
  const canWrite = canWriteInChannel(myRole ?? 'member', { writePermission });
  const writeLockedPlaceholder =
    writePermission === 'admin'
      ? 'Only admins can post in this channel'
      : writePermission === 'mod'
      ? 'Only mods and admins can post in this channel'
      : '';

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeChannelId]);

  // Focus input when reply is set
  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  // Populate input when editing. We parse the message content into three
  // pieces so the textarea never shows long-form `nostr:npub1<hex>` tokens or
  // bare attachment URLs:
  //   1. Peel off image/video/upload URLs → pre-filled PendingAttachments
  //      (rendered in the attachments strip above the textarea).
  //   2. Replace remaining mention tokens with friendly `@DisplayName` markers
  //      and stash the reverse map on `mentionMapRef` for submit-time
  //      re-serialization.
  useEffect(() => {
    if (editingMessage) {
      const { text, attachments: existing } = splitContentForEditing(editingMessage.content);
      const { display, map } = contentToDisplayTokens(text, memberList);
      mentionMapRef.current = map;
      setContent(display);
      setAttachments(existing);
      textareaRef.current?.focus();
    }
    // memberList intentionally omitted: we only want to reparse on edit entry,
    // not whenever the member list updates live (which would clobber the
    // user's in-flight edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingMessage]);

  const buildPayload = (): string => {
    // Attachments are serialized into the message body: images & videos as
    // bare URLs (picked up by the inline media renderers), docs as markdown
    // links (rendered as AttachmentCard). Keeping this in `content` means
    // the backend doesn't need a separate column — pragmatic for now.
    // Skip chips whose upload is still in flight — handleSubmit also guards
    // against this, but belt-and-braces for the edit flow where uploading
    // is always false and `existing:true` items still need serialization.
    const attachmentLines = attachments
      .filter((a) => !a.uploading)
      .map((a) =>
        a.isImage || a.isVideo || a.isAudio ? a.url : `[${a.name}](${a.url})`,
      );
    // Re-serialize any `@DisplayName` markers back into the canonical
    // `nostr:npub1<hex>` form the backend + chat renderers expect.
    const canonical = displayTokensToContent(content, mentionMapRef.current);
    const text = canonical.trim();
    if (attachmentLines.length === 0) return text;
    if (!text) return attachmentLines.join('\n');
    return `${text}\n${attachmentLines.join('\n')}`;
  };

  const handleSubmit = () => {
    if (!activeChannelId) return;
    // Block send while any upload is still running — otherwise a chip with an
    // empty `url` could slip into the message body.
    if (uploading) return;
    const payload = buildPayload();
    if (!payload) return;

    // `/jugar [tipo]` — intercepts the message and launches the games picker
    // (or creates a game directly when a known type is provided).
    const jugar = /^\/jugar(?:\s+([\w-]+))?\s*$/i.exec(payload.trim());
    if (jugar) {
      const type = jugar[1];
      // Dynamic import keeps the Nostr/chat bundle light.
      import('@/store/games').then(({ useGamesStore }) => {
        if (type) {
          fetch('/api/games', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, channelId: activeChannelId }),
          }).then(async (res) => {
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              alert(d.error || 'No se pudo crear el juego');
              return;
            }
            const d = await res.json();
            if (d.game) {
              useGamesStore.getState().upsertGame(d.game);
              useGamesStore.getState().setFullscreenGame(d.game.id);
              useGamesStore.getState().setGameChatOpen(true);
            }
          });
        } else {
          useGamesStore.getState().setPickerOpen({ channelId: activeChannelId });
        }
      });
      setContent('');
      setAttachments([]);
      setUploadError(null);
      mentionMapRef.current = new Map();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // `/zap [target] [amount]` — opens the zap picker. Prefills target + amount
    // when provided (target can be a hex pubkey or a `nostr:npub1…` mention).
    const zap = /^\/zap(?:\s+(\S+))?(?:\s+(\d+))?\s*$/i.exec(payload.trim());
    if (zap) {
      (async () => {
        const { useZapStore } = await import('@/store/zap');
        const { nip19 } = await import('nostr-tools');
        let target: string | undefined;
        const rawTarget = zap[1];
        if (rawTarget) {
          try {
            const clean = rawTarget.replace(/^nostr:/, '');
            if (clean.startsWith('npub1')) {
              const dec = nip19.decode(clean);
              if (dec.type === 'npub') target = dec.data as string;
            } else if (/^[0-9a-f]{64}$/i.test(clean)) {
              target = clean.toLowerCase();
            }
          } catch { /* ignore */ }
        }
        const amount = zap[2] ? parseInt(zap[2], 10) : undefined;
        useZapStore.getState().setPickerOpen({ channelId: activeChannelId, target, amountSats: amount });
      })();
      setContent('');
      setAttachments([]);
      setUploadError(null);
      mentionMapRef.current = new Map();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // `/balance` — fetches the caller's wallet balance and injects a
    // self-only ephemeral message into the chat pane.
    if (/^\/balance\s*$/i.exec(payload.trim())) {
      (async () => {
        const { useChatStore } = await import('@/store/chat');
        try {
          const r = await fetch('/api/wallet/balance');
          const d = await r.json().catch(() => ({}));
          if (r.ok) {
            useChatStore.getState().pushEphemeral(activeChannelId, `⚡ Balance: ${Number(d.balanceSats || 0).toLocaleString()} sats`);
          } else if (d.error === 'no_wallet') {
            useChatStore.getState().pushEphemeral(activeChannelId, '⚠️ No tenés wallet NWC configurada. Abrí tu perfil para conectarla.');
          } else {
            useChatStore.getState().pushEphemeral(activeChannelId, `⚠️ No se pudo leer el balance (${d.error || r.status}).`);
          }
        } catch {
          useChatStore.getState().pushEphemeral(activeChannelId, '⚠️ No se pudo contactar la wallet.');
        }
      })();
      setContent('');
      setAttachments([]);
      setUploadError(null);
      mentionMapRef.current = new Map();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    if (editingMessage && onEditSave) {
      onEditSave(editingMessage.id, payload);
      setEditingMessage(null);
    } else {
      onSend(payload, replyingTo?.id);
      setReplyingTo(null);
    }

    setContent('');
    setAttachments([]);
    setUploadError(null);
    mentionMapRef.current = new Map();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const insertEveryone = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart;
    const textBefore = content.slice(0, cursorPos);
    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex === -1) return;
    const before = content.slice(0, atIndex);
    const after = content.slice(cursorPos);
    const token = '@everyone ';
    const newContent = `${before}${token}${after}`;
    setContent(newContent);
    setMentionQuery(null);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      const newPos = before.length + token.length;
      ta.setSelectionRange(newPos, newPos);
      ta.focus();
    });
  };

  const insertMention = (member: MemberInfo) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart;
    // Find the @ that triggered this
    const textBefore = content.slice(0, cursorPos);
    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex === -1) return;

    const before = content.slice(0, atIndex);
    const after = content.slice(cursorPos);
    // Friendly display form for the textarea; canonical form stored in the
    // map and substituted back during `buildPayload`.
    const displayToken = nextDisplayToken(member);
    mentionMapRef.current.set(displayToken, serializeMention(member.pubkey));
    const newContent = `${before}${displayToken} ${after}`;
    setContent(newContent);
    setMentionQuery(null);
    setMentionIndex(0);

    // Restore cursor position after the mention
    requestAnimationFrame(() => {
      const newPos = before.length + displayToken.length + 1;
      ta.setSelectionRange(newPos, newPos);
      ta.focus();
    });
  };

  const insertShortcode = (s: ShortcodeSuggestion) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart;
    const textBefore = content.slice(0, cursorPos);
    // Match the `:query` fragment at the end of textBefore; find the `:`
    // that started the trigger so we can replace it with the full `:name:`.
    const m = /:[\w+-]*$/.exec(textBefore);
    if (!m) return;
    const colonIndex = textBefore.length - m[0].length;
    const before = content.slice(0, colonIndex);
    const after = content.slice(cursorPos);
    const token = `:${s.name}: `;
    const newContent = `${before}${token}${after}`;
    setContent(newContent);
    setShortcodeQuery(null);
    setShortcodeIndex(0);

    requestAnimationFrame(() => {
      const newPos = before.length + token.length;
      ta.setSelectionRange(newPos, newPos);
      ta.focus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Shortcode autocomplete — only when mention autocomplete isn't claiming
    // the keyboard. Mentions win precedence on conflicts.
    if (mentionQuery === null && shortcodeQuery !== null && shortcodeResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setShortcodeIndex((i) => (i + 1) % shortcodeResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setShortcodeIndex((i) => (i - 1 + shortcodeResults.length) % shortcodeResults.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertShortcode(shortcodeResults[shortcodeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShortcodeQuery(null);
        return;
      }
    }

    // Slash-command autocomplete navigation
    if (slashQuery !== null && slashResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashResults.length) % slashResults.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const picked = slashResults[slashIndex];
        if (picked) insertSlashCommand(picked);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashQuery(null);
        return;
      }
    }

    // Mention autocomplete navigation
    if (mentionQuery !== null && mentionListLength > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionListLength);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionListLength) % mentionListLength);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (showEveryone && mentionIndex === 0) {
          insertEveryone();
        } else {
          const offset = showEveryone ? 1 : 0;
          const picked = mentionResults[mentionIndex - offset];
          if (picked) insertMention(picked);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      if (editingMessage) {
        setEditingMessage(null);
        setContent('');
        setAttachments([]);
        mentionMapRef.current = new Map();
      } else if (replyingTo) {
        setReplyingTo(null);
      }
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    onTyping?.();
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';

    // Detect @ mention trigger
    const cursorPos = ta.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }

    // Detect `:name` shortcode trigger — only when the `:` is preceded by
    // whitespace, start-of-input, or an opening bracket, so `http://…:colon`
    // URLs don't fire it.
    const colonMatch = textBefore.match(/(?:^|[\s>(])(:([\w+-]{0,64}))$/);
    if (colonMatch) {
      setShortcodeQuery(colonMatch[2]);
      setShortcodeIndex(0);
    } else {
      setShortcodeQuery(null);
    }

    // Detect slash-command: the input begins with `/` followed by word chars,
    // with no whitespace yet. Closes as soon as a space is typed (the command
    // has been chosen) or the slash is removed.
    const slashMatch = /^\/([a-zA-Z]*)$/.exec(val);
    if (slashMatch) {
      setSlashQuery(slashMatch[1]);
      setSlashIndex(0);
    } else {
      setSlashQuery(null);
    }
  };

  const insertSlashCommand = (cmd: SlashCommand) => {
    const next = `/${cmd.name} `;
    setContent(next);
    setSlashQuery(null);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(next.length, next.length);
      }
    });
  };

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setContent((c) => (c ? `${c}${text.startsWith(' ') ? '' : ' '}${text}` : text));
      return;
    }
    const start = ta.selectionStart ?? content.length;
    const end = ta.selectionEnd ?? content.length;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const pad = before && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
    const next = `${before}${pad}${text}${after}`;
    setContent(next);
    requestAnimationFrame(() => {
      const pos = before.length + pad.length + text.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  /**
   * Upload a single file with per-chip progress. Switched from fetch() to
   * XMLHttpRequest because only XHR exposes `upload.onprogress` events. The
   * chip is inserted immediately so the user sees the file while bytes are
   * flying; on success it's upgraded with the server-returned URL, on
   * failure it's removed and the error bubbles up via uploadError.
   */
  const uploadFile = (file: File): Promise<void> => {
    const chipId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Optimistic chip — appears immediately with a 0% progress bar.
    setAttachments((prev) => [
      ...prev,
      {
        id: chipId,
        url: '',
        name: file.name,
        type: file.type,
        size: file.size,
        isImage: file.type.startsWith('image/'),
        isVideo: file.type.startsWith('video/'),
        isAudio: file.type.startsWith('audio/'),
        uploading: true,
        progress: 0,
      },
    ]);

    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      const qs = activeServerId
        ? `?serverId=${encodeURIComponent(activeServerId)}`
        : '';
      xhr.open('POST', `/api/upload${qs}`);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = e.loaded / e.total;
        setAttachments((prev) =>
          prev.map((a) => (a.id === chipId ? { ...a, progress: pct } : a)),
        );
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as {
              url: string;
              name: string;
              size: number;
              type: string;
              isImage: boolean;
              isVideo: boolean;
              isAudio?: boolean;
            };
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === chipId
                  ? {
                      ...a,
                      url: data.url,
                      name: data.name,
                      type: data.type,
                      size: data.size,
                      isImage: data.isImage,
                      isVideo: data.isVideo,
                      isAudio: !!data.isAudio,
                      uploading: false,
                      progress: 1,
                    }
                  : a,
              ),
            );
          } catch {
            setAttachments((prev) => prev.filter((a) => a.id !== chipId));
            setUploadError('Invalid server response');
          }
        } else {
          let errorMsg = `Upload failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body?.error) errorMsg = body.error;
          } catch {
            // fall through with default message
          }
          setAttachments((prev) => prev.filter((a) => a.id !== chipId));
          setUploadError(errorMsg);
        }
        resolve();
      };

      xhr.onerror = () => {
        setAttachments((prev) => prev.filter((a) => a.id !== chipId));
        setUploadError('Network error during upload');
        resolve();
      };

      const fd = new FormData();
      fd.append('file', file);
      xhr.send(fd);
    });
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadError(null);

    // Enforce the per-message attachment cap before hitting the network.
    // Count every chip including uploading ones so rapid multi-drops don't
    // blow past the cap.
    const remaining = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    if (remaining <= 0) {
      setUploadError(
        `Máximo ${MAX_ATTACHMENTS_PER_MESSAGE} archivos por mensaje`,
      );
      return;
    }
    const accepted = files.slice(0, remaining);
    if (files.length > remaining) {
      setUploadError(
        `Solo se aceptaron ${remaining} archivos (máximo ${MAX_ATTACHMENTS_PER_MESSAGE} por mensaje)`,
      );
    }

    // Fire all uploads in parallel; each manages its own chip lifecycle.
    await Promise.all(accepted.map((f) => uploadFile(f)));
  };

  // Drag & drop handlers. Only react when the drag carries files so text
  // drags from within the textarea don't trigger the overlay. A counter
  // handles dragenter/leave firing on every child element.
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounter.current += 1;
    setDragOver(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragOver(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    await uploadFiles(files);
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
    // reset so selecting the same file twice re-triggers change
    e.target.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    await uploadFiles(files);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const onEmojiSelect = (emoji: string) => {
    insertAtCursor(emoji);
    setEmojiOpen(false);
  };

  // GIF picker: add the GIF as a pending attachment chip (thumbnail preview)
  // instead of dumping the raw URL into the textarea. `existing: true` skips
  // the upload flow — buildPayload serializes the URL back on submit.
  const onGifSelect = (url: string) => {
    const name = (() => {
      try {
        const p = new URL(url).pathname;
        return decodeURIComponent(p.slice(p.lastIndexOf('/') + 1)) || 'gif';
      } catch {
        return 'gif';
      }
    })();
    setAttachments((prev) => [
      ...prev,
      {
        id: `gif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        name,
        type: 'image/gif',
        size: 0,
        isImage: true,
        isVideo: false,
        isAudio: false,
        existing: true,
      },
    ]);
    setGifOpen(false);
  };

  if (!activeChannelId) return null;

  return (
    <div
      className="px-2 md:px-4 pb-3 md:pb-4 pt-2 shrink-0 relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & drop overlay */}
      {dragOver && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none m-2 rounded-xl border-2 border-dashed border-lc-green bg-lc-green/10 backdrop-blur-sm"
          data-testid="drag-drop-overlay"
        >
          <div className="text-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto mb-1 text-lc-green"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm font-semibold text-lc-green">Suelta para adjuntar</p>
          </div>
        </div>
      )}

      {/* Mention autocomplete */}
      {mentionQuery !== null && mentionListLength > 0 && (
        <MentionAutocomplete
          members={mentionResults}
          onSelect={insertMention}
          onClose={() => setMentionQuery(null)}
          selectedIndex={mentionIndex}
          showEveryone={showEveryone}
          onSelectEveryone={insertEveryone}
        />
      )}

      {/* Slash-command autocomplete */}
      {slashQuery !== null && slashResults.length > 0 && (
        <SlashCommandAutocomplete
          commands={slashResults}
          selectedIndex={slashIndex}
          onSelect={insertSlashCommand}
          onClose={() => setSlashQuery(null)}
        />
      )}

      {/* Shortcode autocomplete — suppressed while mention autocomplete is active */}
      {mentionQuery === null && shortcodeQuery !== null && shortcodeResults.length > 0 && (
        <EmojiAutocomplete
          suggestions={shortcodeResults}
          onSelect={insertShortcode}
          onClose={() => setShortcodeQuery(null)}
          selectedIndex={shortcodeIndex}
        />
      )}

      {/* Edit preview bar */}
      {editingMessage && (
        <div className="flex items-center gap-2 px-4 py-2 mb-1 bg-lc-border/30 rounded-t-xl border-l-2 border-yellow-500/50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-500/70 shrink-0">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          <span className="text-xs text-lc-muted truncate flex-1">
            Editando mensaje
          </span>
          <button
            onClick={() => {
              setEditingMessage(null);
              setContent('');
              setAttachments([]);
              mentionMapRef.current = new Map();
            }}
            className="text-lc-muted hover:text-lc-white transition shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* Reply preview bar */}
      {replyingTo && !editingMessage && (
        <div className="flex items-center gap-2 px-4 py-2 mb-1 bg-lc-border/30 rounded-t-xl border-l-2 border-lc-green/50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-lc-green/70 shrink-0">
            <polyline points="9 17 4 12 9 7"/>
            <path d="M20 18v-2a4 4 0 00-4-4H4"/>
          </svg>
          <span className="text-xs text-lc-muted truncate flex-1">
            Replying to <span className="text-lc-green/70 font-medium">{memberList.find((m) => m.pubkey === replyingTo.authorPubkey)?.displayName || shortNpub(replyingTo.authorPubkey)}</span>
            <span className="ml-1">{replyingTo.content.slice(0, 80)}{replyingTo.content.length > 80 ? '...' : ''}</span>
          </span>
          <button
            onClick={() => setReplyingTo(null)}
            className="text-lc-muted hover:text-lc-white transition shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {uploadError && (
        <div className="px-4 py-1 mb-1 text-xs text-red-400" data-testid="upload-error">
          {uploadError}
        </div>
      )}

      <div className={`bg-lc-border/50 px-3 py-2 ${replyingTo || editingMessage ? 'rounded-b-xl' : 'rounded-xl'}`}>
        {/* Pending attachments strip */}
        {attachments.length > 0 && (
          <div
            className="flex flex-wrap gap-2 pb-2 border-b border-lc-border/60 mb-2"
            data-testid="attachments-strip"
          >
            {attachments.map((a) => (
              <div
                key={a.id}
                className="relative group bg-lc-dark border border-lc-border rounded-lg overflow-hidden"
                data-testid="attachment-chip"
              >
                {a.isImage ? (
                  <img
                    src={a.url || undefined}
                    alt={a.name}
                    className="w-20 h-20 object-cover bg-lc-black"
                  />
                ) : a.isVideo ? (
                  <div className="relative w-20 h-20">
                    {a.url ? (
                      <video
                        src={a.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-20 h-20 object-cover bg-lc-black"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-lc-black" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="white" className="drop-shadow">
                        <polygon points="6 4 20 12 6 20 6 4" />
                      </svg>
                    </div>
                  </div>
                ) : a.isAudio ? (
                  <div className="w-36 h-20 flex items-center gap-2 px-2" data-testid="audio-chip">
                    <div className="shrink-0 w-9 h-9 rounded bg-lc-border/60 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-green">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-lc-white truncate">{a.name}</p>
                      <p className="text-[10px] text-lc-muted">
                        {(a.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="w-36 h-20 flex items-center gap-2 px-2">
                    <div className="shrink-0 w-9 h-9 rounded bg-lc-border/60 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-green">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-lc-white truncate">{a.name}</p>
                      <p className="text-[10px] text-lc-muted">
                        {(a.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                )}

                {/* Per-file progress bar */}
                {a.uploading && (
                  <div
                    className="absolute left-0 right-0 bottom-0 h-1 bg-lc-border/60"
                    data-testid="upload-progress"
                  >
                    <div
                      className="h-full bg-lc-green transition-[width] duration-150"
                      style={{ width: `${Math.round(((a.progress ?? 0) * 100))}%` }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => removeAttachment(a.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-lc-black/80 text-lc-white flex items-center justify-center hover:bg-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  data-testid="remove-attachment"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
        {/* Attach button + menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Attach"
            onClick={() => setAttachMenuOpen((o) => !o)}
            disabled={uploading}
            className="p-1.5 rounded-lg text-lc-muted hover:text-lc-green disabled:opacity-50 transition-colors"
            data-testid="attach-button"
          >
            {uploading ? (
              <span className="lc-spinner w-5 h-5 inline-block" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            )}
          </button>
          {attachMenuOpen && (
            <div
              className="absolute bottom-full left-0 mb-2 w-56 bg-lc-dark border border-lc-border rounded-xl shadow-lg overflow-hidden z-50"
              data-testid="attach-menu"
            >
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-lc-white hover:bg-lc-border/60 transition-colors text-left"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-green">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Subir un archivo
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            onChange={handleFileInputChange}
            data-testid="file-input"
          />
        </div>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={!canWrite}
          placeholder={
            canWrite
              ? `Message #${activeChannel?.name || 'channel'}`
              : writeLockedPlaceholder
          }
          rows={1}
          className={`flex-1 bg-transparent text-sm text-lc-white placeholder-lc-muted resize-none outline-none max-h-[200px] py-1.5 ${
            canWrite ? '' : 'cursor-not-allowed opacity-60'
          }`}
          data-testid="message-textarea"
        />

        {/* Emoji picker */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Emoji"
            onClick={() => setEmojiOpen((o) => !o)}
            className="p-1.5 rounded-lg text-lc-muted hover:text-lc-green transition-colors"
            data-testid="emoji-button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          {emojiOpen && (
            <EmojiPicker
              onSelect={onEmojiSelect}
              onClose={() => setEmojiOpen(false)}
              serverEmojis={serverEmojis}
            />
          )}
        </div>

        {/* GIF picker — opens the server's curated GIF library */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="GIF"
            onClick={() => setGifOpen((o) => !o)}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-lc-muted hover:text-lc-green transition-colors text-[10px] font-bold tracking-wide border border-current/30"
            data-testid="gif-button"
            title="Insert GIF from server library"
          >
            GIF
          </button>
          {gifOpen && (
            <GifPicker
              gifs={serverGifs}
              onSelect={onGifSelect}
              onClose={() => setGifOpen(false)}
            />
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={(!content.trim() && attachments.length === 0) || uploading || !canWrite}
          className="p-1.5 rounded-lg text-lc-muted hover:text-lc-green disabled:opacity-30 disabled:hover:text-lc-muted transition-colors shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
        </div>
      </div>
    </div>
  );
}
