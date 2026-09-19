'use client';

/**
 * The reply / repost / like / zap row under a note.
 *
 * The first version of this used raw unicode glyphs — `↩ ⇄ ♡ ⚡`. That looks
 * bad for reasons worth writing down, because the fix is not "pick nicer
 * characters":
 *
 *  - Those codepoints are font-dependent. `⚡` (U+26A1) and `♡` (U+2661) have
 *    emoji presentation on most platforms, so two of the four icons rendered
 *    as full-colour emoji at a different size and baseline from the two that
 *    stayed as text glyphs. The row was visibly ragged and no amount of CSS
 *    fixed it, because it's the font deciding.
 *  - All four shared one hover colour, so nothing distinguished a destructive
 *    -ish action (zap spends money) from a free one.
 *  - The hit target was the glyph itself — a handful of pixels on a phone.
 *
 * So: inline SVG at a fixed 24-unit viewBox (the same icon language as
 * `NAV_ICONS` and the server rail), one accent colour per action, and a
 * circular hover pad that makes the target ~36px without changing layout.
 *
 * Quote used to be hidden behind a right-click on repost, which is
 * undiscoverable and impossible on touch. Repost now opens a two-item menu,
 * matching what every other Nostr client does.
 */

import { useRef, useState } from 'react';
import { useTranslation } from '@/i18n/context';
import AnchoredMenu from './AnchoredMenu';

/** Per-action accent. Keyed by action so the mapping is legible at a glance. */
const ACCENT = {
  reply: {
    text: 'group-hover/act:text-sky-400 group-focus-visible/act:text-sky-400',
    pad: 'group-hover/act:bg-sky-400/10 group-focus-visible/act:bg-sky-400/10',
    on: 'text-sky-400',
  },
  repost: {
    text: 'group-hover/act:text-lc-green group-focus-visible/act:text-lc-green',
    pad: 'group-hover/act:bg-lc-green/10 group-focus-visible/act:bg-lc-green/10',
    on: 'text-lc-green',
  },
  like: {
    text: 'group-hover/act:text-rose-400 group-focus-visible/act:text-rose-400',
    pad: 'group-hover/act:bg-rose-400/10 group-focus-visible/act:bg-rose-400/10',
    on: 'text-rose-400',
  },
  zap: {
    text: 'group-hover/act:text-amber-400 group-focus-visible/act:text-amber-400',
    pad: 'group-hover/act:bg-amber-400/10 group-focus-visible/act:bg-amber-400/10',
    on: 'text-amber-400',
  },
  share: {
    text: 'group-hover/act:text-violet-400 group-focus-visible/act:text-violet-400',
    pad: 'group-hover/act:bg-violet-400/10 group-focus-visible/act:bg-violet-400/10',
    on: 'text-violet-400',
  },
  neutral: {
    text: 'group-hover/act:text-lc-white group-focus-visible/act:text-lc-white',
    pad: 'group-hover/act:bg-white/10 group-focus-visible/act:bg-white/10',
    on: 'text-lc-white',
  },
} as const;

export type ActionKind = keyof typeof ACCENT;

const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function ReplyIcon() {
  return (
    <svg {...svgProps}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function RepostIcon() {
  return (
    <svg {...svgProps}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

/** Filled when the user has reacted — the state change should be obvious. */
export function LikeIcon({ filled }: { filled?: boolean }) {
  return (
    <svg {...svgProps} fill={filled ? 'currentColor' : 'none'}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function ZapIcon({ filled }: { filled?: boolean }) {
  return (
    <svg {...svgProps} fill={filled ? 'currentColor' : 'none'}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg {...svgProps}>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v14" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function ActionButton({
  kind,
  label,
  icon,
  count,
  testId,
  onClick,
  disabled,
  active,
}: {
  kind: ActionKind;
  label: string;
  icon: React.ReactNode;
  count?: number;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const accent = ACCENT[kind];
  return (
    <button
      type="button"
      // `group/act` is named so the hover pad and the count can both react
      // without the nested NoteCard hover states interfering.
      className={`group/act -m-1 flex items-center gap-1 rounded-full p-1 transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        active ? accent.on : 'text-lc-muted'
      }`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-testid={testId}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${accent.pad} ${active ? '' : accent.text}`}
      >
        {icon}
      </span>
      {/* Reserve the slot so the row doesn't reflow when a count appears. */}
      <span
        className={`min-w-[1.25rem] text-left text-xs tabular-nums transition-colors ${active ? '' : accent.text}`}
      >
        {count !== undefined && count > 0 ? formatCount(count) : ''}
      </span>
    </button>
  );
}

/**
 * Repost with a Quote option. A plain button can't offer both, and hiding
 * quote behind a right-click meant touch users had no way to reach it.
 */
export function RepostButton({
  count,
  active,
  disabled,
  onRepost,
  onQuote,
}: {
  count: number;
  active?: boolean;
  disabled?: boolean;
  onRepost: () => void;
  onQuote?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // With no quote handler there's nothing to choose between, so stay a
  // one-tap button rather than opening a single-item menu.
  if (!onQuote) {
    return (
      <ActionButton
        kind="repost"
        label={t('social.repost')}
        icon={<RepostIcon />}
        count={count}
        testId="note-repost"
        active={active}
        disabled={disabled}
        onClick={onRepost}
      />
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <ActionButton
        kind="repost"
        label={t('social.repost')}
        icon={<RepostIcon />}
        count={count}
        testId="note-repost"
        active={active}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      />
      {/*
        Portalled for the same reason as the ⋯ menu: a note card's
        `contain: paint` clips and stacking-traps anything positioned inside
        it, so this would render under the next card.
      */}
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        width={150}
        align="start"
        testId="note-repost-menu"
      >
        <>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-lc-white hover:bg-white/5"
            onClick={() => { setOpen(false); onRepost(); }}
            data-testid="note-repost-confirm"
          >
            <RepostIcon />
            {t('social.repost')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-lc-white hover:bg-white/5"
            onClick={() => { setOpen(false); onQuote(); }}
            data-testid="note-quote"
          >
            <QuoteIcon />
            {t('social.quote')}
          </button>
        </>
      </AnchoredMenu>
    </div>
  );
}

function QuoteIcon() {
  return (
    <svg {...svgProps}>
      <path d="M17 6H3" />
      <path d="M21 12H3" />
      <path d="M15 18H3" />
    </svg>
  );
}
