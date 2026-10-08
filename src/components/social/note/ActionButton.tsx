'use client';

/**
 * One action under a note: a circular hover pad that makes the target
 * ~36px without changing layout, one accent colour per action (zap spends
 * money; nothing else does, and the colours say so), and the count beside
 * it in a reserved slot so the row doesn't reflow when one appears.
 */

import Button from '@/components/ui/buttons/Button';
import type { ReactNode } from 'react';
import { formatCount } from '@/utils/format/format-count';

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

export default function ActionButton({
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
  icon: ReactNode;
  count?: number;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const accent = ACCENT[kind];
  return (
    <Button
      variant="bare"
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
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${accent.pad} ${active ? '' : accent.text}`}
      >
        {icon}
      </span>
      {/* Reserve the slot so the row doesn't reflow when a count appears. */}
      <span
        className={`min-w-[1.25rem] text-left text-xs tabular-nums transition-colors ${active ? '' : accent.text}`}
      >
        {count !== undefined && count > 0 ? formatCount(count) : ''}
      </span>
    </Button>
  );
}
