'use client';

import { useMemo, useState } from 'react';
import {
  EMOJI_CATEGORIES,
  EMOJI_CATEGORY_NAMES,
  SEARCHABLE_EMOJI,
  normalizeEmojiKeyword,
} from '@/components/chat/emoji-data';
import { loadRecentEmojis, pushRecentEmoji } from '@/lib/recent-emojis';
import { normalizeCustomEmojiName, type CustomEmojiMap } from '@/lib/custom-emoji-tags';
import { useChatStore } from '@/store/chat';

export interface PickedCustomEmoji {
  readonly name: string;
  readonly url: string;
}

export interface EmojiPickerProps {
  onPick: (emoji: string, custom?: PickedCustomEmoji) => void;
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
  customEmojis?: CustomEmojiMap;
}

export default function EmojiPicker({
  onPick,
  onClose,
  disabledEmojis,
  skipRecent = false,
  variant = 'popover',
  className,
  customEmojis: customEmojisProp,
}: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>(() => loadRecentEmojis());
  const storeCustomEmojis = useChatStore((s) => s.serverEmojis);
  const customEmojis = customEmojisProp ?? storeCustomEmojis;

  const q = normalizeEmojiKeyword(query.trim());
  const filtered = useMemo(() => {
    if (!q) return null;
    return SEARCHABLE_EMOJI.filter((e) => e.haystack.includes(q)).slice(0, 80);
  }, [q]);
  const customEntries = useMemo(
    () => Object.entries(customEmojis)
      .map(([name, url]) => ({ name: normalizeCustomEmojiName(name), url }))
      .filter((e) => e.name && e.url)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [customEmojis],
  );
  const filteredCustom = useMemo(() => {
    if (!q) return customEntries;
    return customEntries.filter((e) => e.name.includes(q)).slice(0, 80);
  }, [customEntries, q]);

  const disabled = disabledEmojis ?? new Set<string>();

  const handlePick = (emoji: string) => {
    if (!skipRecent) setRecents(pushRecentEmoji(emoji));
    onPick(emoji);
  };
  const handlePickCustom = (emoji: PickedCustomEmoji) => {
    const shortcode = `:${emoji.name}:`;
    if (!skipRecent) setRecents(pushRecentEmoji(shortcode));
    onPick(shortcode, emoji);
  };

  const isSheet = variant === 'sheet';
  const containerClass = isSheet
    ? 'flex h-full w-full flex-col bg-lc-dark p-3 '
    : 'absolute right-0 bottom-full mb-1 z-30 w-72 rounded-md border border-lc-border bg-lc-dark p-2 shadow-2xl ';
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
          <>
            {filteredCustom.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
                  Custom
                </div>
                <div className={gridClass}>
                  {filteredCustom.map((e) => {
                    const shortcode = `:${e.name}:`;
                    const mine = disabled.has(shortcode);
                    return (
                      <button
                        key={`custom-${e.name}`}
                        onClick={() => handlePickCustom(e)}
                        disabled={mine}
                        className={emojiBtnClass}
                        title={mine ? 'Already reacted' : shortcode}
                      >
                        <img src={e.url} alt={shortcode} className="h-[1.35em] w-[1.35em] object-contain" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className={gridClass}>
              {filtered.length === 0 && filteredCustom.length === 0 && (
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
          </>
        ) : (
          <>
            {recents.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
                  Recent
                </div>
                <div className={gridClass}>
                  {recents.map((char) => {
                    const customMatch = /^:([a-z0-9_]{1,64}):$/i.exec(char);
                    const custom = customMatch ? customEntries.find((e) => e.name === normalizeCustomEmojiName(customMatch[1])) : null;
                    const mine = disabled.has(char);
                    return (
                      <button
                        key={`recent-${char}`}
                        onClick={() => custom ? handlePickCustom(custom) : handlePick(char)}
                        disabled={mine}
                        className={emojiBtnClass}
                        title={mine ? 'Already reacted' : 'Recent'}
                      >
                        {custom ? (
                          <img src={custom.url} alt={char} className="h-[1.35em] w-[1.35em] object-contain" />
                        ) : char}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {customEntries.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
                  Custom
                </div>
                <div className={gridClass}>
                  {customEntries.map((e) => {
                    const shortcode = `:${e.name}:`;
                    const mine = disabled.has(shortcode);
                    return (
                      <button
                        key={`custom-${e.name}`}
                        onClick={() => handlePickCustom(e)}
                        disabled={mine}
                        className={emojiBtnClass}
                        title={mine ? 'Already reacted' : shortcode}
                      >
                        <img src={e.url} alt={shortcode} className="h-[1.35em] w-[1.35em] object-contain" />
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
