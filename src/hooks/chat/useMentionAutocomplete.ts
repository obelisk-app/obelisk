'use client';

/**
 * The @-mention picker, minus its paint. Both shells render one: desktop as
 * a Tailwind popover above `ChatComposer`, the phone as a CSS-class popup
 * above `ChannelComposer`. Everything that is not a class name lives here,
 * so the two cannot drift apart again (the desktop copy rendered a raw hex
 * slice where the phone showed an npub, against the repo's own label rule).
 *
 * Touch and mouse are handled on separate, non-overlapping paths:
 *
 *   touch → `touchend`, with `preventDefault()`
 *   mouse → `click`, with `preventDefault()` on `mousedown`
 *
 * Touch resolves on `touchend` because preventing its default is the one
 * thing that reliably stops the browser from moving focus off the composer.
 * Losing focus dismisses the soft keyboard, `useKeyboardInset` drops to 0,
 * and the shell's `height: calc(100dvh - var(--kb-inset))` reflows the whole
 * screen. Preventing it also suppresses the synthetic mouse events and the
 * trailing `click`, which is what stopped the tap from landing as a ghost
 * click on whatever the reflow moved under the finger: the bottom nav
 * un-hides at exactly that moment, which is how a mention tap once ended
 * up on the DMs tab. A touch that travelled more than `TAP_SLOP_PX` was the
 * user scrolling the list, so it selects nothing.
 *
 * `mousedown` is prevented (without selecting) so a mouse click does not
 * blur the composer either; the selection then rides the `click`.
 */
import { useCallback, useEffect, useRef, type MouseEvent, type TouchEvent } from 'react';
import type { MemberInfo } from '@/utils/message-text/mentions';
import { avatarInitials } from '@/utils/identity/display-name';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useDismiss } from '@/hooks/useDismiss';

const TAP_SLOP_PX = 10;

export interface MentionAutocompleteOptions {
  readonly members: ReadonlyArray<MemberInfo>;
  readonly selectedIndex: number;
  readonly onSelect: (member: MemberInfo) => void;
  readonly onHover: (index: number) => void;
  /** When given, a pointer-down outside the list closes it. */
  readonly onClose?: () => void;
}

export interface MentionRowProps {
  readonly ref: (el: HTMLButtonElement | null) => void;
  readonly onTouchStart: (e: TouchEvent<HTMLButtonElement>) => void;
  readonly onTouchEnd: (e: TouchEvent<HTMLButtonElement>) => void;
  readonly onMouseDown: (e: MouseEvent<HTMLButtonElement>) => void;
  readonly onClick: () => void;
  readonly onMouseEnter: () => void;
}

export interface MentionRow {
  readonly member: MemberInfo;
  readonly active: boolean;
  /** `npub1abcd…wxyz`: the disambiguator when two people share a name. Never hex. */
  readonly keyLabel: string;
  /** Letter avatar when there is no picture. */
  readonly initials: string;
  readonly props: MentionRowProps;
}

export function useMentionAutocomplete({
  members,
  selectedIndex,
  onSelect,
  onHover,
  onClose,
}: MentionAutocompleteOptions): { rootRef: React.RefObject<HTMLDivElement | null>; rows: MentionRow[] } {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Escape stays with the composer's own key handling.
  useDismiss({ refs: [rootRef], onDismiss: () => onClose?.(), enabled: Boolean(onClose), escape: 'ignore' });

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex]);

  const onTouchStart = useCallback((e: TouchEvent<HTMLButtonElement>) => {
    const t = e.touches[0];
    touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
  }, []);

  const rows = members.map((member, index): MentionRow => ({
    member,
    active: index === selectedIndex,
    keyLabel: shortNpubLabel(member.pubkey),
    initials: avatarInitials(member.displayName, member.pubkey),
    props: {
      ref: (el) => { itemRefs.current[index] = el; },
      onTouchStart,
      onTouchEnd: (e) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        if (!t) return;
        if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > TAP_SLOP_PX) return;
        e.preventDefault();
        onSelect(member);
      },
      onMouseDown: (e) => e.preventDefault(),
      onClick: () => onSelect(member),
      onMouseEnter: () => onHover(index),
    },
  }));

  return { rootRef, rows };
}
