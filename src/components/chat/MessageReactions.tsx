'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker from './EmojiPicker';
import { resolveReactionEmoji } from '@/lib/emoji-shortcodes';
import { formatPubkey } from '@/lib/nostr';

export interface ReactionEntry {
  id?: string;
  authorPubkey: string;
  emoji: string;
}

interface Props {
  reactions: ReactionEntry[] | undefined;
  myPubkey: string | null | undefined;
  serverEmojis: Record<string, string>;
  onToggle: (emoji: string) => void;
  profileCache?: Map<string, { name?: string; picture?: string }>;
  size?: 'sm' | 'md';
  showAddButton?: boolean;
  className?: string;
  addButtonTestId?: string;
  chipTestId?: string;
}

function groupReactions(reactions: ReactionEntry[], myPubkey: string | null | undefined) {
  const m = new Map<string, { pubkeys: string[]; isMine: boolean }>();
  for (const r of reactions) {
    const entry = m.get(r.emoji) || { pubkeys: [], isMine: false };
    if (!entry.pubkeys.includes(r.authorPubkey)) entry.pubkeys.push(r.authorPubkey);
    if (myPubkey && r.authorPubkey === myPubkey) entry.isMine = true;
    m.set(r.emoji, entry);
  }
  return Array.from(m.entries());
}

export default function MessageReactions({
  reactions,
  myPubkey,
  serverEmojis,
  onToggle,
  profileCache,
  size = 'md',
  showAddButton = false,
  className,
  addButtonTestId = 'reaction-add-btn',
  chipTestId = 'reaction-badge',
}: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!showPicker || !addBtnRef.current) return;
    const r = addBtnRef.current.getBoundingClientRect();
    setPickerPos({ top: r.bottom + 4, left: r.left });
  }, [showPicker]);

  const grouped = useMemo(
    () => groupReactions(reactions ?? [], myPubkey ?? null),
    [reactions, myPubkey],
  );

  if (grouped.length === 0 && !showAddButton) return null;

  const chipCls =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[11px]'
      : 'px-1.5 py-0.5 text-xs';

  const nameFor = (pubkey: string) =>
    profileCache?.get(pubkey)?.name || formatPubkey(pubkey);

  return (
    <div
      className={
        className ?? 'flex flex-wrap items-center gap-1 relative'
      }
    >
      {grouped.map(([emoji, { pubkeys, isMine }], index) => {
        const resolved = resolveReactionEmoji(emoji, serverEmojis);
        const count = pubkeys.length;
        const previewNames = profileCache ? pubkeys.slice(0, 3).map(nameFor) : [];
        const remaining = count - previewNames.length;
        const emojiLabel = resolved.kind === 'custom' ? `:${resolved.name}:` : resolved.char;
        return (
          <div key={emoji} className="relative group/reaction">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(emoji);
              }}
              className={`inline-flex items-center gap-1 rounded-full border transition-all ${chipCls} ${
                isMine
                  ? 'bg-lc-green/20 border-lc-green/40 text-lc-green'
                  : 'bg-lc-dark border-lc-border text-lc-muted hover:border-lc-green/30'
              }`}
              data-testid={chipTestId}
            >
              {resolved.kind === 'custom' ? (
                <img
                  src={resolved.url}
                  alt={`:${resolved.name}:`}
                  className="w-4 h-4 object-contain"
                />
              ) : (
                <span>{resolved.char}</span>
              )}
              <span>{count}</span>
            </button>
            {profileCache && (
              <div
                role="tooltip"
                data-testid="reaction-tooltip"
                className={`pointer-events-none absolute bottom-full mb-2 z-[100] hidden group-hover/reaction:flex items-center gap-2 bg-lc-dark border border-lc-border rounded-xl shadow-xl px-2.5 py-1.5 w-max max-w-[240px] ${
                  index < 2 ? 'left-0 translate-x-0' : 'left-1/2 -translate-x-1/2'
                }`}
              >
<div className="shrink-0 text-xl leading-none">
                  {resolved.kind === 'custom' ? (
                    <img src={resolved.url} alt={emojiLabel} className="w-5 h-5 object-contain" />
                  ) : (
                    <span>{resolved.char}</span>
                  )}
                </div>
                <div className="text-xs text-lc-white whitespace-normal break-words leading-tight">
                  {previewNames.join(', ')}
                  {remaining > 0 && (
                    <> y <span className="text-lc-green">{remaining} {remaining === 1 ? 'persona más' : 'personas más'}</span></>
                  )}
                  {' '}han reaccionado con <span className="text-lc-green">{emojiLabel}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {showAddButton && (
        <>
          <button
            ref={addBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPicker((v) => !v);
            }}
            aria-label="Add reaction"
            title="Añadir reacción"
            className={`inline-flex items-center gap-1 rounded-full border border-lc-border text-lc-muted hover:text-lc-white hover:border-lc-green/30 bg-lc-black/40 transition-colors ${chipCls}`}
            data-testid={addButtonTestId}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    onToggle(emoji);
                  }}
                  onClose={() => setShowPicker(false)}
                  serverEmojis={serverEmojis}
                  className="relative"
                />
              </div>,
              document.body,
            )}
        </>
      )}
    </div>
  );
}
