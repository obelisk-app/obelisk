'use client';

import type { RefObject } from 'react';
import type { NavState, ScreenName } from '@/utils/shell/mobile/url-state';
import type { MobileScreenProps } from '@/hooks/shell/mobile/nav/usePhoneShell';
import { carouselSlots, overlayScreenKeyFor, showsOverlay } from '@/utils/shell/mobile/carousel-slots';
import { MessageActionsSheet } from '../sheets/message/MessageActionsSheet';
import { MobileScreenBody } from './MobileScreenBody';
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

/** The carousel: four persistent tab slots, the sub-screen overlay, and the sheets. */
export function MobileScreensHost({
  hostRef, dragLayerRef, isDragging, nav, dragNeighbors, screenProps, slideClass, closeSheet, openZap,
}: Props) {
  return (
    <div className="screens-host" ref={hostRef}>
      <div ref={dragLayerRef} className={`drag-layer ${isDragging ? 'is-dragging' : ''}`}>
        {/* All four top-level screens are persistently mounted with stable
         * keys per screen name. Their on-screen position is controlled by a
         * role class (drag-prev / drag-curr / drag-next / drag-hidden), so a
         * swipe-commit only flips classes, it does NOT remount any screen.
         * Without this, every commit unmounted the neighbor (key changed)
         * and remounted the new active screen, which caused titles +
         * skeleton states to flash on every horizontal nav. */}
        {carouselSlots(nav, dragNeighbors).map((slot) => (
          <div key={slot.screen} className={`drag-slot ${slot.role}`} aria-hidden={slot.role !== 'drag-curr'}>
            <TopLevelScreen screen={slot.screen} p={screenProps} />
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
