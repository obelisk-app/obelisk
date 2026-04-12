'use client';

import { useEffect, useMemo, useRef } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

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

export default function EmojiPicker({ onSelect, onClose, serverEmojis, className }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

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

  return (
    <div
      ref={ref}
      className={className ?? 'absolute bottom-full right-2 mb-2 z-50'}
      data-testid="emoji-picker"
    >
      <Picker
        data={data}
        custom={custom}
        onEmojiSelect={(e: { native?: string; id?: string; src?: string }) => {
          if (e.native) onSelect(e.native);
          else if (e.id) onSelect(`:${e.id}:`);
        }}
        theme="dark"
        previewPosition="none"
        skinTonePosition="search"
        autoFocus
      />
    </div>
  );
}
