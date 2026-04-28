'use client';

import { useMemo, useRef, useState } from 'react';
import type { ServerGif } from '@/store/chat';
import { useClickOutside } from '@/hooks/useClickOutside';

interface GifPickerProps {
  gifs: ServerGif[];
  onSelect: (url: string) => void;
  onClose: () => void;
}

/**
 * Composer-side picker for the server's curated GIF library. Mirrors the
 * visual layout of `EmojiPicker` (anchored bottom-right of the composer) but
 * renders a masonry-ish 2-column grid of thumbnails because GIFs are browsed
 * visually, not searched for by exact name.
 *
 * Search matches against `name` and any tag. Substring, case-insensitive.
 * Empty server library still shows the chrome so mods know the feature exists
 * and where to upload.
 */
export default function GifPicker({ gifs, onSelect, onClose }: GifPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');

  useClickOutside(ref, onClose, { escape: true });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return gifs;
    return gifs.filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true;
      if (g.tags && g.tags.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [gifs, query]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-2 w-80 bg-lc-dark border border-lc-border rounded-xl shadow-lg overflow-hidden z-50"
      data-testid="gif-picker"
    >
      <div className="p-2 border-b border-lc-border">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar GIF / Search GIFs…"
          className="w-full px-2 py-1.5 text-xs bg-lc-border/40 rounded text-lc-white placeholder-lc-muted outline-none focus:bg-lc-border/60"
          data-testid="gif-search"
          autoFocus
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {gifs.length === 0 ? (
          <p className="text-center text-xs text-lc-muted py-8 px-4">
            No GIFs in this server&apos;s library yet. Mods can upload them from the admin panel.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-lc-muted py-8">
            Sin resultados / No results
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onSelect(g.url);
                  onClose();
                }}
                title={g.name}
                className="group relative aspect-square rounded-lg overflow-hidden bg-lc-black border border-lc-border hover:border-lc-green/60 transition"
                data-testid="gif-entry"
              >
                <img
                  src={g.url}
                  alt={g.name}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-lc-white bg-lc-black/70 translate-y-full group-hover:translate-y-0 transition-transform truncate">
                  {g.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
