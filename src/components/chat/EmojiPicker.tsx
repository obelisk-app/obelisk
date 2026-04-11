'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMOJI_CATEGORIES,
  EMOJI_CATEGORY_NAMES,
  SEARCHABLE_EMOJI,
  normalizeEmojiKeyword,
  type EmojiEntry,
} from './emoji-data';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /**
   * Custom per-server emojis to surface at the top of the picker under a
   * "Server" category. Map of `name → url`. Selecting one inserts `:name:`
   * into the composer so it round-trips through the render-time resolver.
   */
  serverEmojis?: Record<string, string>;
}

export default function EmojiPicker({ onSelect, onClose, serverEmojis }: EmojiPickerProps) {
  const hasServerEmojis = serverEmojis && Object.keys(serverEmojis).length > 0;
  const categories = useMemo(
    () => (hasServerEmojis ? ['Server', ...EMOJI_CATEGORY_NAMES] : EMOJI_CATEGORY_NAMES),
    [hasServerEmojis],
  );
  const [active, setActive] = useState(categories[0]);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // "Custom" picker entries wrap a URL instead of a unicode char; the renderer
  // below disambiguates by checking for `:name:` shortcodes.
  const serverEntries = useMemo<EmojiEntry[]>(
    () =>
      hasServerEmojis
        ? Object.entries(serverEmojis!).map(([name, url]) => ({
            char: `:${name}:`,
            keywords: [name],
            // Carry the url via a side channel since EmojiEntry only has char/keywords.
            // Consumers below read it out of the serverEmojis map directly.
          }))
        : [],
    [hasServerEmojis, serverEmojis],
  );

  const results = useMemo<EmojiEntry[]>(() => {
    const q = normalizeEmojiKeyword(query.trim());
    if (!q) {
      if (active === 'Server') return serverEntries;
      return EMOJI_CATEGORIES[active] || [];
    }
    const terms = q.split(/\s+/);
    // Search includes server entries too so `:partyparrot:` shows up.
    const all = [
      ...serverEntries.map((e) => ({ ...e, haystack: e.keywords.map(normalizeEmojiKeyword).join(' ') })),
      ...SEARCHABLE_EMOJI,
    ];
    return all.filter((e) => terms.every((t) => e.haystack.includes(t)));
  }, [query, active, serverEntries]);

  const searching = query.trim().length > 0;

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-2 mb-2 w-72 bg-lc-dark border border-lc-border rounded-xl shadow-lg overflow-hidden z-50"
      data-testid="emoji-picker"
    >
      <div className="p-2 border-b border-lc-border">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar emoji... / Search emoji..."
          className="w-full px-2 py-1.5 text-xs bg-lc-border/40 rounded text-lc-white placeholder-lc-muted outline-none focus:bg-lc-border/60"
          data-testid="emoji-search"
        />
      </div>
      {!searching && (
        <div className="flex border-b border-lc-border">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                active === c ? 'text-lc-green border-b-2 border-lc-green' : 'text-lc-muted hover:text-lc-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-56 overflow-y-auto p-2 grid grid-cols-8 gap-1">
        {results.length === 0 && searching ? (
          <p className="col-span-8 text-center text-xs text-lc-muted py-4">
            Sin resultados / No results
          </p>
        ) : (
          results.map((e, i) => {
            const isCustom = e.char.startsWith(':') && e.char.endsWith(':');
            const customUrl = isCustom && serverEmojis ? serverEmojis[e.keywords[0]] : null;
            return (
              <button
                key={`${e.char}-${i}`}
                onClick={() => onSelect(e.char)}
                className="w-8 h-8 flex items-center justify-center text-xl hover:bg-lc-border/60 rounded transition-colors"
                title={e.keywords[0]}
              >
                {customUrl ? (
                  <img src={customUrl} alt={e.keywords[0]} className="w-6 h-6 object-contain" />
                ) : (
                  e.char
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
