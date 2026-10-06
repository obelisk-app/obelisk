'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function VoiceLandingPage() {
  const t = useTranslations();
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
          <h1 className="text-xl font-semibold">{t('voice.voicePage.title')}</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Enter the same name on two devices (logged in with two different
            Nostr keys) to start a call. Audio + video + screenshare are P2P
            over WebRTC; only signaling goes through the relay.
          </p>
        </div>
        <Input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder={t('voice.voicePage.roomPlaceholder')}
          aria-label={t('voice.voicePage.roomPlaceholder')}
          className="font-mono"
        />
        <Button type="submit" variant="pill" size="sm" className="w-full">
          {t('voice.voicePage.enter')}
        </Button>
      </form>
    </div>
  );
}
