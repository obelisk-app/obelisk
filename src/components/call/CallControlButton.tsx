'use client';

import Button from '@/components/ui/buttons/Button';
import type { ReactNode } from 'react';

/** One round button in the call view's control row. */
export default function CallControlButton({
  onClick, label, active = true, danger = false, children, testId,
}: {
  onClick: () => void; label: string; active?: boolean; danger?: boolean; children: ReactNode; testId?: string;
}) {
  const cls = danger
    ? 'bg-red-500 text-white hover:bg-red-600'
    : active
      ? 'bg-white/10 text-lc-white hover:bg-white/20'
      : 'bg-lc-white text-lc-black hover:brightness-95';
  return (
    <Button
      variant="bare"
      type="button"
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${cls}`}
      aria-label={label}
      title={label}
      aria-pressed={danger ? undefined : !active}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}
