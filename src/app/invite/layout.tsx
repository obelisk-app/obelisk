import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invitación',
  robots: { index: false, follow: false, nocache: true },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
