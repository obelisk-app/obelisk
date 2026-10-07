'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { VOICE_CHAT_MIN, VOICE_CHAT_MAX } from '@/constants/shell/panes';

const DEFAULT_WIDTH = 400;
const WIDTH_KEY = 'obelisk:voice-chat-width';

/** The saved width when it is in range, read once for the first render. */
function readSavedWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    return saved >= VOICE_CHAT_MIN && saved <= VOICE_CHAT_MAX ? saved : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

/**
 * Owns the voice channel chat-rail width state + the drag-to-resize logic.
 * Starts from the persisted width (read in the first render, not in an
 * effect after it) and, on every
 * closed→open transition, defaults the rail to half of the main voice area
 * so it doesn't jump to a stale absolute value.
 */
export function useVoiceChatPane(
  isVoiceChatOpen: boolean,
  voiceMainRef: RefObject<HTMLDivElement | null>,
) {
  const [voiceChatWidth, setVoiceChatWidth] = useState(readSavedWidth);
  // On open transition (closed→open), default to half the current voice area width.
  const prevVoiceChatOpenRef = useRef(isVoiceChatOpen);
  useEffect(() => {
    const prev = prevVoiceChatOpenRef.current;
    prevVoiceChatOpenRef.current = isVoiceChatOpen;
    if (!prev && isVoiceChatOpen && voiceMainRef.current) {
      const w = voiceMainRef.current.getBoundingClientRect().width;
      const half = Math.max(VOICE_CHAT_MIN, Math.min(VOICE_CHAT_MAX, Math.round(w / 2)));
      setVoiceChatWidth(half);
      localStorage.setItem(WIDTH_KEY, String(half));
    }
  }, [isVoiceChatOpen, voiceMainRef]);
  const onVoiceChatResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = voiceChatWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.max(VOICE_CHAT_MIN, Math.min(VOICE_CHAT_MAX, startW + delta));
      setVoiceChatWidth(next);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      localStorage.setItem(WIDTH_KEY, String((document.getElementById('voice-chat-rail') as HTMLElement | null)?.offsetWidth || 0));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [voiceChatWidth]);

  return { voiceChatWidth, onVoiceChatResize };
}
