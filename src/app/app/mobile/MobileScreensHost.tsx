'use client';

import type { ReactNode, RefObject } from 'react';
import type { NavState, ScreenName } from './url-state';
import { NAV_ORDER } from './swipe-nav';
import { overlayScreenKeyFor, slotRoleFor } from './carousel-slots';
import { renderTopLevelScreen, type MobileScreenProps } from './MobileScreens';
import { MessageActionsSheet } from './sheets/MessageActionsSheet';
import { ZapModalSheet } from './sheets/ZapModalSheet';

type Props = {
  hostRef: RefObject<HTMLDivElement | null>;
  dragLayerRef: RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  nav: NavState;
  dragNeighbors: { left: ScreenName | null; right: ScreenName | null };
  screenProps: MobileScreenProps;
  /** The active sub-screen, already rendered by `renderScreenBody`. */
  body: ReactNode;
  slideClass: string;
  closeSheet: () => void;
  openZap: MobileScreenProps['openZap'];
};

/** The carousel: four persistent tab slots, the sub-screen overlay, and the sheets. */
export function MobileScreensHost({
  hostRef, dragLayerRef, isDragging, nav, dragNeighbors, screenProps, body, slideClass, closeSheet, openZap,
}: Props) {
  const overlayScreenKey = overlayScreenKeyFor(nav);
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
        {NAV_ORDER.map((s) => {
          const role = slotRoleFor(s, nav, dragNeighbors);
          return (
            <div key={s} className={`drag-slot ${role}`} aria-hidden={role !== 'drag-curr'}>
              {renderTopLevelScreen(s, screenProps)}
            </div>
          );
        })}
        {/* Sub-screens (channel, forum, voice-room, dm-thread, profile-view,
         * search, settings-prefs, ...) ride on top of the persistent slots
         * as a single overlay. Different sub-screens use different keys so
         * navigating between them does remount, that's correct: a forum is
         * not a channel. */}
        {!NAV_ORDER.includes(overlayScreenKey) && body && (
          <div className="drag-slot drag-overlay" key={`sub-${overlayScreenKey}`}>
            <div className={`screen-anim ${slideClass}`}>{body}</div>
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
      {nav.screen === 'zap-modal' && nav.msgContext && (
        <ZapModalSheet msg={nav.msgContext} close={closeSheet} />
      )}
    </div>
  );
}
