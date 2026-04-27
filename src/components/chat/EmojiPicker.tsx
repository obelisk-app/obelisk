'use client';

import { useEffect, useMemo, useRef } from 'react';
import data from '@emoji-mart/data';
import { Picker } from 'emoji-mart';
import { useClickOutside } from '@/hooks/useClickOutside';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /**
   * Custom per-server emojis. Map of `name → url`. emoji-mart surfaces them
   * as a "Server" category; selecting inserts `:name:` so the render-time
   * resolver can swap them back to <img> tags.
   */
  serverEmojis?: Record<string, string>;
  /**
   * Override positioning. Defaults to the chat-input placement (opens upward
   * from the bottom-right). Pass e.g. "absolute top-full left-0 mt-2 z-50"
   * for a dropdown that opens below.
   */
  className?: string;
}

// Thin local wrapper around the vanilla `emoji-mart` Picker web component.
// Replaces `@emoji-mart/react` (unmaintained since Jan 2023, peer-capped at
// React 18) so we can stay on React 19 without `legacy-peer-deps`.
export default function EmojiPicker({ onSelect, onClose, serverEmojis, className }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Ref-latched onSelect: consumers pass inline lambdas whose identity changes
  // every render. Without this latch, the mount effect would tear down and
  // rebuild the (expensive, shadow-DOM) Picker on every parent re-render.
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });

  useClickOutside(ref, onClose);

  const custom = useMemo(() => {
    if (!serverEmojis || Object.keys(serverEmojis).length === 0) return undefined;
    return [
      {
        id: 'server',
        name: 'Server',
        emojis: Object.entries(serverEmojis).map(([name, url]) => ({
          id: name,
          name,
          keywords: [name],
          skins: [{ src: url }],
        })),
      },
    ];
  }, [serverEmojis]);

  useEffect(() => {
    const parent = ref.current;
    if (!parent) return;
    new Picker({
      data,
      custom,
      onEmojiSelect: (e: { native?: string; id?: string; src?: string }) => {
        if (e.native) onSelectRef.current(e.native);
        else if (e.id) onSelectRef.current(`:${e.id}:`);
      },
      theme: 'dark',
      previewPosition: 'none',
      skinTonePosition: 'search',
      autoFocus: true,
      ref: { current: parent },
    });
    return () => { parent.replaceChildren(); };
  }, [custom]);

  return (
    <div
      ref={ref}
      className={className ?? 'absolute bottom-full right-2 mb-2 z-50'}
      data-testid="emoji-picker"
    />
  );
}
