'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export const VOICE_CHAT_MIN = 280;
export const VOICE_CHAT_MAX = 720;

/**
 * Owns the voice channel chat-rail width state + the drag-to-resize logic.
 * Loads a persisted width from localStorage on mount and, on every
 * closed→open transition, defaults the rail to half of the main voice area
 * so it doesn't jump to a stale absolute value.
 */
export function useVoiceChatPane(
  isVoiceChatOpen: boolean,
  voiceMainRef: RefObject<HTMLDivElement | null>,
) {
  const [voiceChatWidth, setVoiceChatWidth] = useState(400);
  useEffect(() => {
    const saved = Number(localStorage.getItem('obelisk:voice-chat-width'));
    if (saved >= VOICE_CHAT_MIN && saved <= VOICE_CHAT_MAX) setVoiceChatWidth(saved);
  }, []);
  // On open transition (closed→open), default to half the current voice area width.
  const prevVoiceChatOpenRef = useRef(isVoiceChatOpen);
  useEffect(() => {
    const prev = prevVoiceChatOpenRef.current;
    prevVoiceChatOpenRef.current = isVoiceChatOpen;
    if (!prev && isVoiceChatOpen && voiceMainRef.current) {
      const w = voiceMainRef.current.getBoundingClientRect().width;
      const half = Math.max(VOICE_CHAT_MIN, Math.min(VOICE_CHAT_MAX, Math.round(w / 2)));
      setVoiceChatWidth(half);
      localStorage.setItem('obelisk:voice-chat-width', String(half));
    }
  }, [isVoiceChatOpen]);
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
      localStorage.setItem('obelisk:voice-chat-width', String((document.getElementById('voice-chat-rail') as HTMLElement | null)?.offsetWidth || 0));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [voiceChatWidth]);

  return { voiceChatWidth, onVoiceChatResize };
}
