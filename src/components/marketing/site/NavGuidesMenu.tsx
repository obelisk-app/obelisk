'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { NavbarModel } from '@/hooks/marketing/useNavbar';
import { guidePath } from '@/utils/guides/guide-urls';
import { ChevronDownIcon } from '@/assets/icons';

const GUIDE_ITEMS = [
  { slug: 'what-is-obelisk', tKey: 'marketing.learn.card.whatIsObelisk.title' },
  { slug: 'how-obelisk-works', tKey: 'marketing.learn.card.howObeliskWorks.title' },
  { slug: 'web-of-trust', tKey: 'marketing.learn.card.webOfTrust.title' },
  { slug: 'future-nostr-relays', tKey: 'marketing.learn.card.futureNostrRelays.title' },
] as const;

/** The navbar's Guides link and the dropdown of four guides it opens on hover or focus. */
export default function NavGuidesMenu({ guides }: { guides: NavbarModel['guides'] }) {
  const t = useTranslations();
  return (
    <div
      className="relative"
      onMouseEnter={guides.show}
      onMouseLeave={guides.hide}
      onFocus={guides.show}
      onBlur={guides.onBlur}
    >
      <Link
        href={guidePath()}
        onClick={guides.hide}
        className="px-3 py-1.5 rounded-lg text-sm font-medium text-lc-muted hover:text-lc-white transition-colors inline-flex items-center gap-1"
        aria-haspopup="true"
        aria-expanded={guides.open}
        data-testid="nav-guides-link"
      >
        {t('marketing.nav.guides')}
        <ChevronDownIcon size={10} strokeWidth={3} className={`transition-transform ${guides.open ? 'rotate-180' : ''}`} />
      </Link>

      {guides.open && (
        <div
          className="absolute left-0 top-full pt-2 w-72"
          data-testid="nav-guides-dropdown"
        >
          <div className="bg-lc-dark border border-lc-border rounded-xl shadow-2xl overflow-hidden">
            {GUIDE_ITEMS.map((g) => (
              <Link
                key={g.slug}
                href={guidePath(g.slug)}
                onClick={guides.hide}
                className="block px-4 py-3 text-sm text-lc-muted hover:bg-lc-border/50 hover:text-lc-white transition"
              >
                {t(g.tKey)}
              </Link>
            ))}
            <Link
              href={guidePath()}
              onClick={guides.hide}
              className="block px-4 py-3 text-sm font-semibold text-lc-green hover:bg-lc-border/50 border-t border-lc-border/50"
            >
              {t('marketing.footer.allGuides')} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
