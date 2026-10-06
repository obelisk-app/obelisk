'use client';

import { useState, useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import ObeliskIcon from '@/components/ui/ObeliskIcon';
import Button from '@/components/ui/Button';
import UserAvatar from '@/components/ui/UserAvatar';
import { LogOutIcon, UserIcon } from '@/components/ui/icons';
import { MENU_PANEL_CLASS, MenuItem, MenuLink } from '@/components/ui/menu';
import { useDismiss } from '@/hooks/useDismiss';
import { notifySavedAccountChanged, useSavedAccount } from '@/hooks/marketing/useSavedAccount';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import LanguageToggle from '@/components/marketing/LanguageToggle';
import { guidePath } from '@/utils/guides/guide-urls';

const SIMPLE_LINKS = [
  { href: '/features', key: 'marketing.nav.features' },
  { href: '/#how-it-works', key: 'marketing.nav.howItWorks' },
  { href: '/#roadmap', key: 'marketing.nav.roadmap' },
] as const;

const GUIDE_ITEMS = [
  { slug: 'what-is-obelisk', tKey: 'marketing.learn.card.whatIsObelisk.title' },
  { slug: 'how-obelisk-works', tKey: 'marketing.learn.card.howObeliskWorks.title' },
  { slug: 'web-of-trust', tKey: 'marketing.learn.card.webOfTrust.title' },
  { slug: 'future-nostr-relays', tKey: 'marketing.learn.card.futureNostrRelays.title' },
] as const;

export default function Navbar(_props: { onLoginSuccess?: () => void } = {}) {
  const [showMenu, setShowMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const t = useTranslations();
  // The saved session and cached profile, not the bridge: the marketing pages
  // must not download the relay client just to draw this pill.
  const account = useSavedAccount();
  const npub = account ? shortNpubLabel(account.pubkey) : '';
  const name = account?.name || t('marketing.nav.anon');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDismiss({ refs: [menuRef, triggerRef], onDismiss: () => setShowMenu(false), enabled: showMenu });
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The bridge loads only when someone actually disconnects from here.
  const handleLogout = async () => {
    const { getBridge } = await import('@/services/nostr-bridge');
    const bridge = await getBridge();
    await bridge.logout();
    notifySavedAccountChanged();
    setShowMenu(false);
    router.push('/');
  };

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled ? 'bg-lc-black/95 backdrop-blur-xl' : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <ObeliskIcon className="w-12 h-12 text-lc-green" />
            <span className="font-extrabold text-2xl text-lc-white tracking-tight">Obelisk</span>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {SIMPLE_LINKS.map(({ href, key }) => (
              <a
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-lc-muted hover:text-lc-white transition-colors"
              >
                {t(key)}
              </a>
            ))}

            {/* Guides dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setGuidesOpen(true)}
              onMouseLeave={() => setGuidesOpen(false)}
              onFocus={() => setGuidesOpen(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setGuidesOpen(false);
              }}
            >
              <Link
                href={guidePath()}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-lc-muted hover:text-lc-white transition-colors inline-flex items-center gap-1"
                aria-haspopup="true"
                aria-expanded={guidesOpen}
                data-testid="nav-guides-link"
              >
                {t('marketing.nav.guides')}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className={`transition-transform ${guidesOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>

              {guidesOpen && (
                <div
                  className="absolute left-0 top-full pt-2 w-72"
                  data-testid="nav-guides-dropdown"
                >
                  <div className="bg-lc-dark border border-lc-border rounded-xl shadow-2xl overflow-hidden">
                    {GUIDE_ITEMS.map((g) => (
                      <Link
                        key={g.slug}
                        href={guidePath(g.slug)}
                        className="block px-4 py-3 text-sm text-lc-muted hover:bg-lc-border/50 hover:text-lc-white transition"
                      >
                        {t(g.tKey)}
                      </Link>
                    ))}
                    <Link
                      href={guidePath()}
                      className="block px-4 py-3 text-sm font-semibold text-lc-green hover:bg-lc-border/50 border-t border-lc-border/50"
                    >
                      {t('marketing.footer.allGuides')} →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/#faq"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-lc-muted hover:text-lc-white transition-colors"
            >
              {t('marketing.nav.faq')}
            </Link>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <LanguageToggle />
            {account ? (
              <>
                <Link
                  href="/app"
                  className="lc-pill lc-pill-primary text-sm"
                  data-testid="nav-app-pill"
                >
                  {t('marketing.nav.app')}
                </Link>
                <div className="relative">
                {/* The account pill: avatar and name in one rounded trigger, a look of its own. */}
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  aria-haspopup="menu"
                  aria-expanded={showMenu}
                  className="flex items-center gap-2.5 py-1.5 pl-1.5 pr-4 bg-lc-dark hover:bg-lc-border rounded-full transition-all duration-200 border border-lc-border/50"
                  data-testid="nav-account-menu"
                >
                  <UserAvatar
                    pubkey={account.pubkey}
                    picture={account.picture}
                    size={8}
                    name={name}
                    alt={name}
                    className="ring-1 ring-lc-border"
                    initialClassName="text-sm"
                  />
                  <span className="text-sm text-lc-white font-medium max-w-[120px] truncate">
                    {name}
                  </span>
                </button>

                {showMenu && (
                  <div ref={menuRef} role="menu" className={`absolute right-0 z-50 mt-2 w-56 ${MENU_PANEL_CLASS}`}>
                    <div className="mb-1 border-b border-lc-border px-3 pb-2 pt-1">
                      <div className="text-sm text-lc-white font-semibold truncate">{name}</div>
                      <div className="text-xs text-lc-muted truncate mt-0.5 font-mono">{npub}</div>
                    </div>
                    <MenuLink
                      icon={<UserIcon />}
                      label={t('marketing.nav.profile')}
                      href="/app"
                      newTab={false}
                      testId="nav-profile-link"
                    />
                    <MenuItem
                      icon={<LogOutIcon />}
                      label={t('marketing.nav.disconnect')}
                      danger
                      onClick={() => void handleLogout()}
                      testId="nav-disconnect"
                    />
                  </div>
                )}
                </div>
              </>
            ) : (
              <Button variant="pill" size="sm" onClick={() => router.push('/app')}>
                {t('marketing.nav.launchApp')}
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* LoginModal removed: the bridge-backed login lives at /app. Old modal called dead /api/auth/challenge. */}
    </>
  );
}
