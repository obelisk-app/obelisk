import Link from 'next/link';
import ObeliskIcon from '@/components/ObeliskIcon';

/**
 * Header for the public viewer pages (`/notes`, `/p`, `/t`).
 *
 * These pages are usually someone's first sight of Obelisk — they arrive from
 * a link pasted somewhere else — so the brand has to look like the brand.
 * The first version used a 24px icon with no colour class, which inherited
 * the body text colour and read as a grey glyph next to small type.
 *
 * This matches `Navbar`: the obelisk in `lc-green` beside an extrabold
 * wordmark, scaled down for a compact sticky bar. Shared rather than repeated
 * three times so the three pages can't drift apart.
 */
export default function ViewerHeader({ maxWidth = 'max-w-2xl' }: { maxWidth?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-lc-border bg-lc-black/90 backdrop-blur">
      <div className={`mx-auto flex ${maxWidth} items-center gap-3 px-5 py-2.5`}>
        <Link href="/" className="flex items-center gap-2" aria-label="Obelisk">
          <ObeliskIcon className="h-9 w-9 text-lc-green" />
          <span className="text-xl font-extrabold tracking-tight text-lc-white">Obelisk</span>
        </Link>
        {/*
          Straight to the feed rather than the app's last view: someone
          arriving from a shared note wants more of this, not whichever
          channel they happened to leave open.
        */}
        <Link href="/app?s=feed" className="lc-pill-primary ml-auto px-4 py-2 text-xs">
          Open in Obelisk
        </Link>
      </div>
    </header>
  );
}
