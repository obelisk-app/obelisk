'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useChatStore } from '@/store/chat';
import { filterMembers, serializeMention, MemberInfo } from '@/lib/mentions';
import MentionAutocomplete from './MentionAutocomplete';

interface MessageInputProps {
  onSend: (content: string, replyToId?: string) => void;
  onEditSave?: (messageId: string, content: string) => void;
  onTyping?: () => void;
}

export default function MessageInput({ onSend, onEditSave, onTyping }: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { activeChannelId, pinnedChannels, categories, replyingTo, setReplyingTo, editingMessage, setEditingMessage, memberList } = useChatStore();

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

  const handleSubmit = () => {
    if (!content.trim() || !activeChannelId) return;

    if (editingMessage && onEditSave) {
      onEditSave(editingMessage.id, content.trim());
      setEditingMessage(null);
    } else {
      onSend(content.trim(), replyingTo?.id);
      setReplyingTo(null);
    }

    setContent('');
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

      <div className={`bg-lc-border/50 flex items-end gap-2 px-4 py-2 ${replyingTo || editingMessage ? 'rounded-b-xl' : 'rounded-xl'}`}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${activeChannel?.name || 'channel'}`}
          rows={1}
          className="flex-1 bg-transparent text-sm text-lc-white placeholder-lc-muted resize-none outline-none max-h-[200px] py-1.5"
        />
        <button
          onClick={handleSubmit}
          disabled={!content.trim()}
          className="p-1.5 rounded-lg text-lc-muted hover:text-lc-green disabled:opacity-30 disabled:hover:text-lc-muted transition-colors shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
