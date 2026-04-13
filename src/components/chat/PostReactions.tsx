'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import EmojiPicker from './EmojiPicker';

export interface PostReactionEntry {
  id: string;
  emoji: string;
  authorPubkey: string;
}

interface Props {
  channelId: string;
  postId: string;
  reactions: PostReactionEntry[];
  size?: 'sm' | 'md';
  onChanged?: (reactions: PostReactionEntry[]) => void;
}

function groupByEmoji(reactions: PostReactionEntry[]) {
  const m = new Map<string, PostReactionEntry[]>();
  for (const r of reactions) {
    const list = m.get(r.emoji) ?? [];
    list.push(r);
    m.set(r.emoji, list);
  }
  return Array.from(m.entries()).sort(
    ([, a], [, b]) => b.length - a.length,
  );
}

export default function PostReactions({
  channelId,
  postId,
  reactions,
  size = 'md',
  onChanged,
}: Props) {
  const myPubkey = useAuthStore((s) => s.profile?.pubkey ?? null);
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const [local, setLocal] = useState<PostReactionEntry[]>(reactions);
  const [showPicker, setShowPicker] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!showPicker || !addBtnRef.current) return;
    const r = addBtnRef.current.getBoundingClientRect();
    setPickerPos({ top: r.bottom + 4, left: r.left });
  }, [showPicker]);
  const grouped = useMemo(() => groupByEmoji(local), [local]);

  const toggle = async (emoji: string) => {
    if (!myPubkey) return;
    const mine = local.find((r) => r.emoji === emoji && r.authorPubkey === myPubkey);
    const optimistic = mine
      ? local.filter((r) => r.id !== mine.id)
      : [
          ...local,
          { id: `tmp-${Date.now()}`, emoji, authorPubkey: myPubkey },
        ];
    setLocal(optimistic);
    onChanged?.(optimistic);
    try {
      const res = await fetch(
        `/api/channels/${channelId}/messages/${postId}/reactions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.reactions) {
          setLocal(data.reactions);
          onChanged?.(data.reactions);
        }
      }
    } catch {
      /* best-effort; the next refetch will reconcile */
    }
  };

  const pillCls =
    size === 'sm'
      ? 'rounded-full px-1.5 py-0.5 text-[11px] gap-1'
      : 'rounded-full px-2 py-0.5 text-xs gap-1';

  return (
    <div className="flex items-center gap-1.5 flex-wrap relative">
      {grouped.map(([emoji, list]) => {
        const mineActive = !!myPubkey && list.some((r) => r.authorPubkey === myPubkey);
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void toggle(emoji);
            }}
            className={`flex items-center ${pillCls} border transition-colors ${
              mineActive
                ? 'bg-lc-green/15 border-lc-green/50 text-lc-white'
                : 'bg-lc-black/40 border-lc-border text-lc-muted hover:text-lc-white'
            }`}
            data-testid={`post-reaction-${emoji}`}
          >
            <span>{emoji}</span>
            <span>{list.length}</span>
          </button>
        );
      })}
      <button
        ref={addBtnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowPicker((v) => !v);
        }}
        className={`flex items-center ${pillCls} border border-lc-border text-lc-muted hover:text-lc-white bg-lc-black/40 transition-colors`}
        aria-label="Add reaction"
        data-testid="post-reaction-add"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>
      {showPicker && pickerPos && typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, zIndex: 1000 }}
            onClick={(e) => e.stopPropagation()}
          >
            <EmojiPicker
              onSelect={(emoji) => {
                setShowPicker(false);
                void toggle(emoji);
              }}
              onClose={() => setShowPicker(false)}
              serverEmojis={serverEmojis}
              className="relative"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
