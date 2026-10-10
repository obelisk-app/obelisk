'use client';

/**
 * Viewport gate for /app - renders the phone shell below 1024px and the
 * desktop shell at Tailwind's `lg` breakpoint and up. Only the active
 * shell mounts; shared voice playback survives a change of layout.
 *
 * SSR renders a neutral loading state for the first paint; the client picks the right shell
 * once `window.matchMedia` resolves. This avoids hydration mismatches when
 * the user-agent and viewport disagree.
 */

import dynamic from 'next/dynamic';
import AnalyticsConsentRoot from '@/components/analytics/AnalyticsConsentRoot';
import { ShellLoading } from './mounts/ShellLoading';
// Hoist the mobile shell's stylesheet up to the eagerly-loaded route bundle
// so it's in place before the dynamic PhoneShell chunk hydrates. Without
// this, Next.js loads the CSS only when the dynamic chunk arrives - which
// in practice means the first paint of the mobile UI is unstyled (SVG
// icons render at default browser size, etc.).
import './mobile/mobile-shell.css';
import BackgroundVoiceAudio from '@/components/voice/audio/BackgroundVoiceAudio';
import ReadStateRoot from '@/components/read-state/ReadStateRoot';
import ActivityIndicator from '@/components/feedback/ActivityIndicator';
import { LazyDmCallLayer } from './mounts/lazy-mounts';
import { useAppGate } from '@/hooks/shell/mounts/useAppGate';

const AppShell = dynamic(() => import('./desktop/DesktopShell'), { ssr: false, loading: ShellLoading });
const MobileShell = dynamic(() => import('./mobile/PhoneShell'), { ssr: false, loading: ShellLoading });

export default function AppGate() {
  const { isMobile, loggedIn } = useAppGate();
  if (isMobile === null) return <ShellLoading />;
  return (
    <>
      <AnalyticsConsentRoot appSession />
      {loggedIn ? <ReadStateRoot /> : null}
      {loggedIn ? <BackgroundVoiceAudio /> : null}
      {loggedIn ? <LazyDmCallLayer /> : null}
      {isMobile ? <MobileShell /> : <AppShell />}
      {!isMobile && <ActivityIndicator />}
    </>
  );
}
