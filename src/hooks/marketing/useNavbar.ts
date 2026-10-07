'use client';

import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useDismiss } from '@/hooks/common/useDismiss';
import { useSavedAccount } from '@/hooks/marketing/useSavedAccount';
import { notifySavedAccountChanged } from '@/services/marketing/saved-account';
import { shortNpubLabel } from '@/utils/identity/short-npub';

/**
 * The marketing navbar's view model: whether the page has scrolled (the bar
 * turns solid), the guides dropdown, and the signed-in account pill with its
 * menu.
 *
 * The account comes from the saved session and cached profile, not the
 * bridge: the marketing pages must not download the relay client just to
 * draw this pill.
 */
export function useNavbar() {
  const t = useTranslations();
  const router = useRouter();
  const account = useSavedAccount();
  const [showMenu, setShowMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDismiss({ refs: [menuRef, triggerRef], onDismiss: () => setShowMenu(false), enabled: showMenu });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The bridge loads only when someone actually disconnects from here. This
  // is the one React file allowed to call `getBridge()`
  // (`tests/bridge-in-react-files.test.ts`): the marketing pages have no
  // provider, so that their first load ships without the bridge.
  const logout = async () => {
    const { getBridge } = await import('@/services/nostr-bridge');
    const bridge = await getBridge();
    await bridge.logout();
    notifySavedAccountChanged();
    setShowMenu(false);
    router.push('/');
  };

  return {
    scrolled,
    account,
    name: account?.name || t('marketing.nav.anon'),
    npub: account ? shortNpubLabel(account.pubkey) : '',
    menuRef,
    triggerRef,
    menu: {
      open: showMenu,
      toggle: () => setShowMenu(!showMenu),
      logout: () => void logout(),
    },
    guides: {
      open: guidesOpen,
      show: () => setGuidesOpen(true),
      hide: () => setGuidesOpen(false),
      /** Focus moving out of the dropdown closes it; moving within it does not. */
      onBlur: (e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setGuidesOpen(false);
      },
    },
    launchApp: () => router.push('/app'),
  };
}

export type NavbarModel = ReturnType<typeof useNavbar>;
