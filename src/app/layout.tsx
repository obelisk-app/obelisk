import type { ReactNode } from 'react';

/**
 * A pass-through: the real root layouts are `[locale]/layout.tsx` (every
 * page, `<html lang>` from the URL) and `dev/layout.tsx`. This one exists
 * because `not-found.tsx` at the root needs a layout above it.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
