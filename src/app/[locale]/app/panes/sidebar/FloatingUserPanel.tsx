'use client';

import VoiceStatusBar from '@/components/voice/status-bar/VoiceStatusBar';
import { SidebarMe } from './SidebarMe';

export function FloatingUserPanel({
  sidebarWidth,
  collapsed = false,
}: {
  sidebarWidth: number;
  /**
   * Views with no sidebar (the full-screen feed) have nothing for this panel
   * to span, so a full-width bar floats over the content looking like a
   * leftover. Collapsed, it is just the avatar, and expands on hover.
   *
   * Done in CSS rather than hover state: this sits above a feed of hundreds
   * of memoised cards, and a re-render on every pointer enter/leave is the
   * kind of thing that makes scrolling feel bad for no visible reason.
   */
  collapsed?: boolean;
}) {
  // Server rail is 72px wide; panel sits 8px from left with 8px right gap to
  // the sidebar's right edge, so it spans the full sidebar+rail width.
  const width = 72 + sidebarWidth - 16;
  return (
    <div
      className={`group/me pointer-events-none absolute bottom-3 left-2 z-30 hidden flex-col gap-2 md:flex ${
        collapsed ? 'w-14 transition-[width] duration-200 ease-out hover:w-64' : ''
      }`}
      style={collapsed ? undefined : { width: `${width}px` }}
    >
      <div className="pointer-events-auto empty:hidden [&>[data-testid=voice-status-bar]]:!p-0 [&_[data-testid=voice-status-bar]>div]:bg-lc-card/95 [&_[data-testid=voice-status-bar]>div]:shadow-2xl [&_[data-testid=voice-status-bar]>div]:backdrop-blur">
        <VoiceStatusBar />
      </div>
      <div
        className={`pointer-events-auto flex min-h-[3.5rem] items-center overflow-hidden rounded-xl border border-lc-border bg-lc-card/95 shadow-2xl backdrop-blur ${
          collapsed ? 'px-3 group-hover/me:px-4' : 'px-4'
        }`}
      >
        <SidebarMe collapsible={collapsed} />
      </div>
    </div>
  );
}
