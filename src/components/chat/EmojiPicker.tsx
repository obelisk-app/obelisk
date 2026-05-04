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
  className?: string;
}

export default function EmojiPicker({
  onPick,
  onClose,
  disabledEmojis,
  skipRecent = false,
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

  return (
    <div
      role="dialog"
      aria-label="Emoji picker"
      className={
        'absolute right-0 top-7 z-30 w-72 rounded-md border border-lc-border bg-lc-dark p-2 shadow-2xl ' +
        (className ?? '')
      }
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="flex-1 rounded border border-lc-border bg-lc-black px-2 py-1 text-xs text-lc-white placeholder:text-lc-muted focus:border-lc-green focus:outline-none"
        />
        <button
          onClick={onClose}
          className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white"
          aria-label="Close emoji picker"
          title="Close"
        >
          ✕
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered ? (
          <div className="grid grid-cols-8 gap-0.5">
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
                  className="rounded p-1 text-lg hover:bg-lc-card disabled:opacity-40 disabled:cursor-default"
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
                <div className="grid grid-cols-8 gap-0.5">
                  {recents.map((char) => {
                    const mine = disabled.has(char);
                    return (
                      <button
                        key={`recent-${char}`}
                        onClick={() => handlePick(char)}
                        disabled={mine}
                        className="rounded p-1 text-lg hover:bg-lc-card disabled:opacity-40 disabled:cursor-default"
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
                <div className="grid grid-cols-8 gap-0.5">
                  {EMOJI_CATEGORIES[cat].map((e) => {
                    const mine = disabled.has(e.char);
                    return (
                      <button
                        key={e.char}
                        onClick={() => handlePick(e.char)}
                        disabled={mine}
                        className="rounded p-1 text-lg hover:bg-lc-card disabled:opacity-40 disabled:cursor-default"
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
