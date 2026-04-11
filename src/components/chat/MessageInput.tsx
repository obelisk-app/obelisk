'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useChatStore } from '@/store/chat';
import { filterMembers, serializeMention, MemberInfo } from '@/lib/mentions';
import MentionAutocomplete from './MentionAutocomplete';
import EmojiPicker from './EmojiPicker';

interface MessageInputProps {
  onSend: (content: string, replyToId?: string) => void;
  onEditSave?: (messageId: string, content: string) => void;
  onTyping?: () => void;
}

interface PendingAttachment {
  id: string;
  url: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
}

export default function MessageInput({ onSend, onEditSave, onTyping }: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeChannelId, pinnedChannels, categories, replyingTo, setReplyingTo, editingMessage, setEditingMessage, memberList } = useChatStore();

  // Attach menu / upload / emoji state
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionResults = useMemo(
    () => mentionQuery !== null ? filterMembers(memberList, mentionQuery).slice(0, 8) : [],
    [memberList, mentionQuery]
  );

  const allChannels = [
    ...pinnedChannels,
    ...categories.flatMap(c => c.channels),
  ];
  const activeChannel = allChannels.find(c => c.id === activeChannelId);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeChannelId]);

  // Focus input when reply is set
  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  // Populate input when editing
  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  const buildPayload = (): string => {
    // Attachments are serialized into the message body: images as bare URLs
    // (picked up by the inline image renderer), docs as markdown links
    // (rendered as AttachmentCard). Keeping this in `content` means the
    // backend doesn't need a separate column — a pragmatic choice for now.
    const attachmentLines = attachments.map((a) =>
      a.isImage ? a.url : `[${a.name}](${a.url})`,
    );
    const text = content.trim();
    if (attachmentLines.length === 0) return text;
    if (!text) return attachmentLines.join('\n');
    return `${text}\n${attachmentLines.join('\n')}`;
  };

  const handleSubmit = () => {
    if (!activeChannelId) return;
    const payload = buildPayload();
    if (!payload) return;

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
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
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
    const mention = serializeMention(member.pubkey);
    const newContent = `${before}${mention} ${after}`;
    setContent(newContent);
    setMentionQuery(null);
    setMentionIndex(0);

    // Restore cursor position after the mention
    requestAnimationFrame(() => {
      const newPos = before.length + mention.length + 1;
      ta.setSelectionRange(newPos, newPos);
      ta.focus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Mention autocomplete navigation
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionResults[mentionIndex]);
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

  const uploadFile = async (file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      const data: {
        url: string;
        name: string;
        size: number;
        type: string;
        isImage: boolean;
      } = await res.json();
      setAttachments((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: data.url,
          name: data.name,
          type: data.type,
          size: data.size,
          isImage: data.isImage,
        },
      ]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      // Upload in parallel — backend is stateless per request.
      await Promise.all(files.map((f) => uploadFile(f)));
    } finally {
      setUploading(false);
    }
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

  if (!activeChannelId) return null;

  return (
    <div className="px-2 md:px-4 pb-3 md:pb-4 pt-2 shrink-0 relative">
      {/* Mention autocomplete */}
      {mentionQuery !== null && mentionResults.length > 0 && (
        <MentionAutocomplete
          members={mentionResults}
          onSelect={insertMention}
          onClose={() => setMentionQuery(null)}
          selectedIndex={mentionIndex}
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
            onClick={() => { setEditingMessage(null); setContent(''); }}
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
            Replying to <span className="text-lc-green/70 font-medium">{replyingTo.authorPubkey.slice(0, 8)}...</span>
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
                    src={a.url}
                    alt={a.name}
                    className="w-20 h-20 object-cover"
                  />
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
            {uploading && (
              <div
                className="w-20 h-20 rounded-lg bg-lc-dark border border-lc-border flex items-center justify-center"
                data-testid="upload-spinner"
              >
                <span className="lc-spinner w-5 h-5 inline-block" />
              </div>
            )}
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
          placeholder={`Message #${activeChannel?.name || 'channel'}`}
          rows={1}
          className="flex-1 bg-transparent text-sm text-lc-white placeholder-lc-muted resize-none outline-none max-h-[200px] py-1.5"
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
            <EmojiPicker onSelect={onEmojiSelect} onClose={() => setEmojiOpen(false)} />
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!content.trim() && attachments.length === 0}
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
