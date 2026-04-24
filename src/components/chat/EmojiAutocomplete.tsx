'use client';

import { useEffect, useRef } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';

export interface ShortcodeSuggestion {
  name: string;
  /** For unicode entries, `char` is the emoji glyph. For custom entries, it's the image URL. */
  char: string;
  isCustom: boolean;
}

interface EmojiAutocompleteProps {
  suggestions: ShortcodeSuggestion[];
  onSelect: (s: ShortcodeSuggestion) => void;
  onClose: () => void;
  selectedIndex: number;
}

/**
 * Autocomplete dropdown for `:name:` shortcodes. Mirrors MentionAutocomplete —
 * same position, same keyboard model, same scroll-into-view behavior — so
 * MessageInput can reuse its navigation logic with a parallel state slot.
 */
export default function EmojiAutocomplete({
  suggestions,
  onSelect,
  onClose,
  selectedIndex,
}: EmojiAutocompleteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useClickOutside(ref, onClose);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute left-4 right-4 bottom-full mb-1 z-50 bg-lc-dark border border-lc-border rounded-xl shadow-lg max-h-48 overflow-y-auto"
      data-testid="emoji-autocomplete"
    >
      {suggestions.map((s, i) => (
        <button
          key={`${s.isCustom ? 'c' : 'u'}-${s.name}`}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          onClick={() => onSelect(s)}
          className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
            i === selectedIndex ? 'bg-lc-border/60' : 'hover:bg-lc-border/40'
          }`}
          data-testid="emoji-option"
        >
          <span className="w-6 h-6 flex items-center justify-center text-lg">
            {s.isCustom ? (
              <img src={s.char} alt={s.name} className="w-5 h-5 object-contain" />
            ) : (
              s.char
            )}
          </span>
          <span className="text-sm text-lc-white font-medium">:{s.name}:</span>
          {s.isCustom && (
            <span className="ml-auto text-[10px] uppercase tracking-wide text-lc-green">Server</span>
          )}
        </button>
      ))}
    </div>
  );
}
