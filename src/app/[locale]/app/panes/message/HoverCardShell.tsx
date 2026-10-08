'use client';

import Text from '@/components/ui/layout/Text';
/** The tooltip box a reaction or zap pill shows on hover: a small title over a list. */
export function HoverCardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none invisible absolute bottom-full left-0 z-30 mb-1 w-56 rounded-md border border-lc-border bg-lc-dark p-2 text-xs text-lc-white opacity-0 shadow-2xl transition-opacity group-hover/pill:visible group-hover/pill:opacity-100"
    >
      <Text as="div" variant="label" size="10" tone="muted" weight="bold" className="mb-1">
        {title}
      </Text>
      {children}
    </div>
  );
}
