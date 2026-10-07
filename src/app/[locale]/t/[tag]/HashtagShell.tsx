import type { ReactNode } from 'react';
import ViewerHeader from '@/components/social/viewer/ViewerHeader';

/** The hashtag page's frame: the viewer header over a centred column. */
export default function HashtagShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-lc-black text-lc-white">
      <ViewerHeader />
      <div className="mx-auto max-w-2xl">{children}</div>
    </main>
  );
}
