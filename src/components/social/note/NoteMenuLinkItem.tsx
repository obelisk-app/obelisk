'use client';

import type { ReactNode } from 'react';

/**
 * A menu row that is a link. The row look of `menu.tsx`'s `MenuItem`;
 * `MenuLink` always opens a new tab, and the group link must not.
 */
export default function NoteMenuLinkItem({
  children,
  href,
  testId,
  newTab = true,
}: {
  children: ReactNode;
  href: string;
  testId: string;
  newTab?: boolean;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      {...(newTab ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-lc-white transition-colors hover:bg-lc-green/15"
      data-testid={testId}
    >
      {children}
    </a>
  );
}
