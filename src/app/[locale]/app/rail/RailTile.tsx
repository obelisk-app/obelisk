'use client';

import type { MouseEventHandler } from 'react';
import Button from '@/components/ui/buttons/Button';
import HintDot from '@/components/hints/HintDot';

/** An account-wide rail entry (DMs, the feed): an icon tile with the active pill. */
export function RailTile({
  active,
  title,
  onClick,
  icon,
  emphasis,
  hint,
  accent,
  onContextMenu,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  emphasis?: boolean;
  accent?: string;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  /** Anchors a first-run hint, and carries its unseen dot. */
  hint?: string;
}) {
  return (
    <div className="relative">
      {hint && <HintDot hintId={hint} />}
      <span
        className={
          'absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-lc-green transition-all ' +
          (active ? 'opacity-100' : 'opacity-0')
        }
      />
      <Button
        variant="bare"
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={title}
        aria-label={title}
        {...(hint ? { 'data-tour': hint } : {})}
        style={accent && active ? { backgroundColor: accent } : undefined}
        className={
          'group/tile relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl ring-1 transition-all duration-150 hover:rounded-xl ' +
          (emphasis
            ? active
              ? 'bg-lc-green text-lc-black ring-lc-green'
              : 'bg-lc-green/10 text-lc-green ring-lc-green/30 hover:bg-lc-green hover:text-lc-black hover:ring-lc-green'
            : active
              ? 'bg-lc-green text-lc-black ring-lc-green'
              : 'bg-lc-card text-lc-white ring-lc-border hover:bg-lc-olive')
        }
      >
        {accent && !active && <span aria-hidden="true" style={{ backgroundColor: accent }} className="pointer-events-none absolute inset-0 opacity-30 group-hover/tile:opacity-60" />}
        {icon}
      </Button>
    </div>
  );
}
