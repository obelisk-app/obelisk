'use client';

import VoiceStatusBar from '@/components/voice/status-bar/VoiceStatusBar';
import { useVoiceStore } from '@/store/voice';
import { isViewingActiveCall, type View } from '@/utils/shell/desktop/view';

/** The voice bar on narrow viewports, hidden while the active call is the open view. */
export function MobileVoiceStatusBar({ currentView }: { currentView: View }) {
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  if (isViewingActiveCall(currentView, currentVoiceChannelId)) return null;
  return <div className="md:hidden"><VoiceStatusBar /></div>;
}
