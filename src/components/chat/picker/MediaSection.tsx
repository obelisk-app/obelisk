'use client';

import type { ReactNode } from 'react';
import type { MediaEntry } from '@/utils/chat/picker/media-catalog';
import { MediaSectionTile } from './MediaSectionTile';

/**
 * A titled grid of media tiles, each with a favourite star; an optional
 * leading tile (the create control). `id` names the section for tests, since
 * the title changes with the language.
 */
export function MediaSection({ id, title, entries, onPick, favoriteUrls, onFavorite, onMediaLoad, onMediaError, children }: {
  id: string;
  title: string;
  entries: readonly MediaEntry[];
  onPick: (entry: MediaEntry) => void;
  favoriteUrls: ReadonlySet<string>;
  onFavorite: (entry: MediaEntry) => void;
  onMediaLoad: (entry: MediaEntry) => void;
  onMediaError: (entry: MediaEntry) => void;
  children?: ReactNode;
}) {
  if (!children && entries.length === 0) return null;
  return (
    <section className="mb-3" data-testid={'media-section-' + id}>
      <h3 className="sticky top-0 z-10 mb-2 border-b border-lc-border bg-[var(--picker-surface,var(--color-lc-dark))] py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted">{title}</h3>
      <div className="grid grid-cols-4 auto-rows-[82px] content-start gap-2">
        {children}
        {entries.map((entry) => (
          <MediaSectionTile
            key={entry.url}
            entry={entry}
            favorite={favoriteUrls.has(entry.url)}
            onPick={onPick}
            onFavorite={onFavorite}
            onMediaLoad={onMediaLoad}
            onMediaError={onMediaError}
          />
        ))}
      </div>
    </section>
  );
}
