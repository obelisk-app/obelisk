'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/store/chat';

interface MessageInputProps {
  onSend: (content: string, replyToId?: string) => void;
}

export default function MessageInput({ onSend }: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { activeChannelId, pinnedChannels, categories, replyingTo, setReplyingTo } = useChatStore();

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

  const handleSubmit = () => {
    if (!content.trim() || !activeChannelId) return;
    onSend(content.trim(), replyingTo?.id);
    setContent('');
    setReplyingTo(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && replyingTo) {
      setReplyingTo(null);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  if (!activeChannelId) return null;

  return (
    <div className="px-4 pb-4 pt-2 shrink-0">
      {/* Reply preview bar */}
      {replyingTo && (
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

      <div className={`bg-lc-border/50 flex items-end gap-2 px-4 py-2 ${replyingTo ? 'rounded-b-xl' : 'rounded-xl'}`}>
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
