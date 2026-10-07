'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';

/** The `/voice` form: the room name (starting at `test`) and opening it; a blank name does nothing. */
export function useVoiceRoomForm() {
  const router = useRouter();
  const [room, setRoom] = useState('test');
  return {
    room,
    setRoom,
    submit: (e: FormEvent) => {
      e.preventDefault();
      const trimmed = room.trim();
      if (!trimmed) return;
      router.push(`/voice/${encodeURIComponent(trimmed)}`);
    },
  };
}
