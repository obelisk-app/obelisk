'use client';

import Container from '@/components/ui/layout/Container';
import Row from '@/components/ui/layout/Row';
import Link from '@/components/ui/navigation/Link';
import { useTranslations } from 'next-intl';
import ObeliskIcon from '@/assets/brand/ObeliskIcon';
import Button from '@/components/ui/buttons/Button';
import LanguageToggle from '@/components/marketing/site/LanguageToggle';
import { useNavbar } from '@/hooks/marketing/useNavbar';
import NavGuidesMenu from './NavGuidesMenu';
import NavAccountMenu from './NavAccountMenu';

const SIMPLE_LINKS = [
  { href: '/features', key: 'marketing.nav.features' },
  { href: '/#how-it-works', key: 'marketing.nav.howItWorks' },
  { href: '/#roadmap', key: 'marketing.nav.roadmap' },
] as const;

/**
 * The public site's top bar: logo, section links, the Guides dropdown
 * (`NavGuidesMenu`), the language picker, and either "Launch app" or the
 * signed-in account (`NavAccountMenu`). State and the lazy logout are in
 * `useNavbar`.
 */
export default function Navbar() {
  const t = useTranslations();
  const { menuRef, triggerRef, ...vm } = useNavbar();

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${vm.scrolled ? 'bg-lc-black/95 backdrop-blur-xl' : 'bg-transparent'
        }`}>
        <Container width="6xl" className="px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <ObeliskIcon className="w-12 h-12 text-lc-green" />
            <span className="font-extrabold text-2xl text-lc-white tracking-tight">Obelisk</span>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {SIMPLE_LINKS.map(({ href, key }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-lc-muted hover:text-lc-white transition-colors"
              >
                {t(key)}
              </Link>
            ))}

            <NavGuidesMenu guides={vm.guides} />

            <Link
              href="/#faq"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-lc-muted hover:text-lc-white transition-colors"
            >
              {t('marketing.nav.faq')}
            </Link>
          </div>

          {/* Right side */}
          <Row gap="3" align="center">
            <LanguageToggle />
            {vm.account ? (
              <>
                <Link
                  href="/app"
                  prefetch={false}
                  variant="button" buttonVariant="pill" size="sm"
                  data-testid="nav-app-pill"
                >
                  {t('marketing.nav.app')}
                </Link>
                <NavAccountMenu
                  account={vm.account}
                  name={vm.name}
                  npub={vm.npub}
                  menu={vm.menu}
                  menuRef={menuRef}
                  triggerRef={triggerRef}
                />
              </>
            ) : (
              <Button variant="pill" size="sm" onClick={vm.launchApp}>
                {t('marketing.nav.launchApp')}
              </Button>
            )}
          </Row>
        </Container>
      </nav>

      {/* LoginModal removed: the bridge-backed login lives at /app. Old modal called dead /api/auth/challenge. */}
    </>
  );
}
