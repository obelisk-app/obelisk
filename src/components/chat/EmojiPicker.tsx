'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EMOJI_CATEGORIES,
  EMOJI_CATEGORY_NAMES,
  SEARCHABLE_EMOJI,
  normalizeEmojiKeyword,
} from '@/components/chat/emoji-data';
import { loadRecentEmojis, pushRecentEmoji } from '@/lib/recent-emojis';

export interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Emojis disabled (e.g. ones the user already reacted with). */
  disabledEmojis?: ReadonlySet<string>;
  /** When true, picking does not record in recents (useful for previews). */
  skipRecent?: boolean;
  /**
   * `popover` (default): small absolute-positioned floating panel for desktop.
   * `sheet`: fills its parent (used inside the mobile bottom-sheet host).
   */
  variant?: 'popover' | 'sheet';
  className?: string;
}

export default function EmojiPicker({
  onPick,
  onClose,
  disabledEmojis,
  skipRecent = false,
  variant = 'popover',
  className,
}: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    setRecents(loadRecentEmojis());
  }, []);

  const q = normalizeEmojiKeyword(query.trim());
  const filtered = useMemo(() => {
    if (!q) return null;
    return SEARCHABLE_EMOJI.filter((e) => e.haystack.includes(q)).slice(0, 80);
  }, [q]);

  const disabled = disabledEmojis ?? new Set<string>();

  const handlePick = (emoji: string) => {
    if (!skipRecent) setRecents(pushRecentEmoji(emoji));
    onPick(emoji);
  };

  const isSheet = variant === 'sheet';
  const containerClass = isSheet
    ? 'flex h-full w-full flex-col bg-lc-dark p-3 '
    : 'absolute right-0 top-7 z-30 w-72 rounded-md border border-lc-border bg-lc-dark p-2 shadow-2xl ';
  const gridClass = isSheet
    ? 'grid grid-cols-8 gap-1'
    : 'grid grid-cols-8 gap-0.5';
  const emojiBtnClass = isSheet
    ? 'flex aspect-square items-center justify-center rounded text-2xl active:bg-lc-card disabled:opacity-40 disabled:cursor-default'
    : 'rounded p-1 text-lg hover:bg-lc-card disabled:opacity-40 disabled:cursor-default';
  const scrollClass = isSheet
    ? 'min-h-0 flex-1 overflow-y-auto'
    : 'max-h-64 overflow-y-auto';

  return (
    <div
      role="dialog"
      aria-label="Emoji picker"
      className={containerClass + (className ?? '')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus={!isSheet}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className={
            'flex-1 rounded border border-lc-border bg-lc-black text-lc-white placeholder:text-lc-muted focus:border-lc-green focus:outline-none ' +
            (isSheet ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs')
          }
        />
        <button
          onClick={onClose}
          className={
            'rounded text-lc-muted hover:bg-lc-card hover:text-lc-white ' +
            (isSheet ? 'h-9 w-9 text-base' : 'p-1')
          }
          aria-label="Close emoji picker"
          title="Close"
        >
          ✕
        </button>
      </div>
      <div className={scrollClass}>
        {filtered ? (
          <div className={gridClass}>
            {filtered.length === 0 && (
              <div className="col-span-8 py-4 text-center text-xs text-lc-muted">No matches</div>
            )}
            {filtered.map((e) => {
              const mine = disabled.has(e.char);
              return (
                <button
                  key={e.char}
                  onClick={() => handlePick(e.char)}
                  disabled={mine}
                  className={emojiBtnClass}
                  title={mine ? 'Already reacted' : e.keywords[0]}
                >
                  {e.char}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            {recents.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
                  Recent
                </div>
                <div className={gridClass}>
                  {recents.map((char) => {
                    const mine = disabled.has(char);
                    return (
                      <button
                        key={`recent-${char}`}
                        onClick={() => handlePick(char)}
                        disabled={mine}
                        className={emojiBtnClass}
                        title={mine ? 'Already reacted' : 'Recent'}
                      >
                        {char}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {EMOJI_CATEGORY_NAMES.map((cat) => (
              <div key={cat} className="mb-2">
                <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
                  {cat}
                </div>
                <div className={gridClass}>
                  {EMOJI_CATEGORIES[cat].map((e) => {
                    const mine = disabled.has(e.char);
                    return (
                      <button
                        key={e.char}
                        onClick={() => handlePick(e.char)}
                        disabled={mine}
                        className={emojiBtnClass}
                        title={mine ? 'Already reacted' : e.keywords[0]}
                      >
                        {e.char}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
