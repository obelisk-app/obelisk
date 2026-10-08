'use client';

import type { RefObject } from 'react';
import type { NavState, ScreenName } from '@/utils/shell/mobile/url-state';
import type { MobileScreenProps } from '@/hooks/shell/mobile/nav/usePhoneShell';
import { overlayScreenKeyFor, showsOverlay } from '@/utils/shell/mobile/carousel-slots';
import { MessageActionsSheet } from '../sheets/message/MessageActionsSheet';
import { MobileScreenBody } from './MobileScreenBody';
import { useCarouselSlots } from '@/hooks/shell/mobile/carousel/useCarouselSlots';
import { TopLevelScreen } from './TopLevelScreen';

type Props = {
  hostRef: RefObject<HTMLDivElement | null>;
  dragLayerRef: RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  nav: NavState;
  dragNeighbors: { left: ScreenName | null; right: ScreenName | null };
  screenProps: MobileScreenProps;
  slideClass: string;
  closeSheet: () => void;
  openZap: MobileScreenProps['openZap'];
};

/** Tabs mount on first exposure and retain their state; sub-screens and sheets overlay them. */
export function MobileScreensHost({
  hostRef, dragLayerRef, isDragging, nav, dragNeighbors, screenProps, slideClass, closeSheet, openZap,
}: Props) {
  const slots = useCarouselSlots(nav, dragNeighbors, isDragging);
  return (
    <div className="screens-host" ref={hostRef}>
      <div ref={dragLayerRef} className={`drag-layer ${isDragging ? 'is-dragging' : ''}`}>
        {/* Slot keys stay stable after a tab is first shown or revealed by a
         * swipe. Unvisited tabs do not fetch feeds or mount profile trees. */}
        {slots.map((slot) => (
          <div key={slot.screen} className={`drag-slot ${slot.role}`} aria-hidden={slot.role !== 'drag-curr'}>
            {slot.mounted && <TopLevelScreen screen={slot.screen} p={screenProps} />}
          </div>
        ))}
        {/* Sub-screens (channel, forum, voice-room, dm-thread, profile-view,
         * search, settings-prefs, ...) ride on top of the persistent slots
         * as a single overlay. Different sub-screens use different keys so
         * navigating between them does remount, that's correct: a forum is
         * not a channel. */}
        {showsOverlay(nav) && (
          <div className="drag-slot drag-overlay" key={`sub-${overlayScreenKeyFor(nav)}`}>
            <div className={`screen-anim ${slideClass}`}><MobileScreenBody nav={nav} p={screenProps} /></div>
          </div>
        )}
      </div>
      {nav.screen === 'msg-actions' && nav.msgContext && (
        <MessageActionsSheet
          msg={nav.msgContext}
          close={closeSheet}
          onZap={() => openZap(nav.msgContext!)}
        />
      )}
    </div>
  );
}
