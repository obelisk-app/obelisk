import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Moderación',
  robots: { index: false, follow: false, nocache: true },
};

export default function ModerationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
