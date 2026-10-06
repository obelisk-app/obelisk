'use client';

import VoiceStatusBar from '@/components/voice/VoiceStatusBar';
import { type ScreenName } from '@/utils/shell/mobile/url-state';

/**
 * Persistent host for the in-call control bar. The bar stays mounted for the
 * lifetime of the call so navigating out of voice-room reveals it via CSS
 * instead of a fresh mount - the previous conditional remount had a
 * perceptible lag (useGroups + useVoiceStore selectors set up subscriptions
 * async, so the bar would flash in ~1s after the user left the room and the
 * call looked ended in the meantime).
 */
export function MobileVoiceStatusSlot({
  screen,
  kbInset,
}: {
  screen: ScreenName;
  kbInset: number;
}) {
  const hidden = screen === 'voice-room' || kbInset > 0;
  return (
    <div
      className={'mobile-voice-status-slot' + (hidden ? ' is-hidden' : '')}
      data-testid="mobile-voice-status-slot"
    >
      <VoiceStatusBar />
    </div>
  );
}
