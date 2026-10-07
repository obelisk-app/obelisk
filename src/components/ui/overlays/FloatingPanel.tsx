'use client';

/**
 * A popover anchored to a trigger that lives inside a scrolling list.
 *
 * An absolutely-positioned menu inside the message list scrolls with the
 * content, gets clipped by the list (and slides under the composer), and
 * decides "open up or down" once, when it opens. So this renders in a portal
 * with fixed coordinates measured from the anchor and re-measured on every
 * scroll and resize:
 *
 *   - it follows its trigger while the list scrolls,
 *   - it flips above/below to whichever side fits, re-deciding as it moves,
 *   - it is clamped to the viewport,
 *   - and it closes once the trigger has scrolled out of the visible part of
 *     its scroll container: a menu for a message you can no longer see is
 *     just in the way.
 *
 * It is `PopoverPanel` with `follow="track"`, no surface, and dismissal left
 * to the host; kept under this name and API for its importer.
 */

import type { ReactNode, RefObject } from 'react';
import PopoverPanel from './PopoverPanel';

const NO_MSG_MENU = { 'data-no-msg-menu': '' } as const;

export default function FloatingPanel({
  anchorRef,
  onClose,
  children,
  prefer = 'below',
  align = 'end',
  testId,
  panelRef,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  prefer?: 'above' | 'below';
  /** Which edge of the anchor the panel lines up with. */
  align?: 'start' | 'end';
  testId?: string;
  /** Lets the host treat clicks inside the panel as "inside". */
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <PopoverPanel
      anchorRef={anchorRef}
      onClose={onClose}
      follow="track"
      prefer={prefer}
      align={align}
      surface="none"
      dismiss="host"
      testId={testId}
      panelRef={panelRef}
      dataAttributes={NO_MSG_MENU}
    >
      {children}
    </PopoverPanel>
  );
}
