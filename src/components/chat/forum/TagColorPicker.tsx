'use client';

import { useRef, useState } from 'react';
import type { JsForumTag } from '@/services/nostr-bridge';
import { paletteForTag, TAG_PALETTES } from '@/utils/forum-tag-colors';
import { useDismiss } from '@/hooks/useDismiss';
import { useTranslations } from 'next-intl';

/**
 * Swatch button + popover for a publication tag's color.
 *
 * "Auto" clears the override back to `null`, which leaves the color derived
 * from the tag id, so a tag is never uncolored, only un-overridden.
 */
export function TagColorPicker({
  tag,
  onPick,
}: {
  tag: JsForumTag;
  onPick: (color: string | null) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss({ refs: [ref], onDismiss: close, enabled: open });
  const current = paletteForTag(tag);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-lc-border bg-lc-dark hover:border-lc-muted"
        style={{ borderColor: current.border }}
        aria-label={t('chat.forum.tagColor', { color: tag.color ? current.label : t('chat.forum.tagColorAuto') })}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`forum-tag-color-${tag.id}`}
      >
        <span
          className="h-3.5 w-3.5 rounded-full"
          style={{ background: current.text }}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1.5 w-44 rounded-xl border border-lc-border bg-lc-dark p-2 shadow-xl"
          data-testid={`forum-tag-color-menu-${tag.id}`}
        >
          <div className="grid grid-cols-5 gap-1.5">
            {TAG_PALETTES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => { onPick(p.key); setOpen(false); }}
                title={p.label}
                aria-label={p.label}
                aria-pressed={tag.color === p.key}
                className={
                  'flex h-6 w-6 items-center justify-center rounded-full border transition-transform hover:scale-110 ' +
                  (tag.color === p.key ? 'border-lc-white' : 'border-transparent')
                }
                style={{ background: p.text }}
                data-testid={`forum-tag-color-opt-${p.key}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => { onPick(null); setOpen(false); }}
            className={
              'mt-2 w-full rounded-md px-2 py-1 text-left text-[11px] hover:bg-lc-card ' +
              (tag.color === null ? 'text-lc-green' : 'text-lc-muted hover:text-lc-white')
            }
            data-testid={`forum-tag-color-auto-${tag.id}`}
          >
            {t(tag.color === null ? 'chat.forum.autoInUse' : 'chat.forum.auto')}
          </button>
        </div>
      )}
    </div>
  );
}
