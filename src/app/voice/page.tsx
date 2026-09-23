'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';

export default function VoiceLandingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [room, setRoom] = useState('test');

  return (
    <div className="min-h-dvh flex items-center justify-center bg-black text-white p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = room.trim();
          if (!trimmed) return;
          router.push(`/voice/${encodeURIComponent(trimmed)}`);
        }}
        className="w-full max-w-md space-y-4 bg-neutral-900 border border-neutral-800 rounded-xl p-6"
      >
        <div>
          <h1 className="text-xl font-semibold">{t('voicePage.title')}</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Enter the same name on two devices (logged in with two different
            Nostr keys) to start a call. Audio + video + screenshare are P2P
            over WebRTC; only signaling goes through the relay.
          </p>
        </div>
        <input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder={t('voicePage.roomPlaceholder')}
          className="w-full bg-black border border-neutral-700 rounded-md px-3 py-2 text-sm font-mono focus:border-emerald-500 outline-none"
        />
        <button
          type="submit"
          className="w-full px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
        >
          {t('voicePage.enter')}
        </button>
      </form>
    </div>
  );
}
