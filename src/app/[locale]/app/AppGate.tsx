'use client';

/**
 * Viewport gate for /app - renders the phone shell below 1024px and the
 * desktop shell at Tailwind's `lg` breakpoint and up. Only the active
 * shell mounts; shared voice playback survives a change of layout.
 *
 * SSR returns `null` for the first paint; the client picks the right shell
 * once `window.matchMedia` resolves. This avoids hydration mismatches when
 * the user-agent and viewport disagree.
 */

import dynamic from 'next/dynamic';
// Hoist the mobile shell's stylesheet up to the eagerly-loaded route bundle
// so it's in place before the dynamic PhoneShell chunk hydrates. Without
// this, Next.js loads the CSS only when the dynamic chunk arrives - which
// in practice means the first paint of the mobile UI is unstyled (SVG
// icons render at default browser size, etc.).
import './mobile/mobile-shell.css';
import BackgroundVoiceAudio from '@/components/voice/audio/BackgroundVoiceAudio';
import ReadStateRoot from '@/components/read-state/ReadStateRoot';
import ActivityIndicator from '@/components/feedback/ActivityIndicator';
import { useAppGate } from '@/hooks/shell/mounts/useAppGate';

const AppShell = dynamic(() => import('./desktop/DesktopShell'), { ssr: false });
const MobileShell = dynamic(() => import('./mobile/PhoneShell'), { ssr: false });

export default function AppGate() {
  const { isMobile, loggedIn } = useAppGate();
  if (isMobile === null) return null;
  return (
    <>
      {loggedIn ? <ReadStateRoot /> : null}
      {loggedIn ? <BackgroundVoiceAudio /> : null}
      {isMobile ? <MobileShell /> : <AppShell />}
      {!isMobile && <ActivityIndicator />}
    </>
  );
}
