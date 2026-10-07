'use client';

import { useTranslations } from 'next-intl';
import { useVoiceRoomForm } from '@/hooks/voice/join/useVoiceRoomForm';
import Input from '@/components/ui/forms/Input';
import Button from '@/components/ui/buttons/Button';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/** Pick a room name and open it. */
export default function VoiceRoomForm() {
  const t = useTranslations();
  const { room, setRoom, submit } = useVoiceRoomForm();

  return (
    <div className="min-h-dvh flex items-center justify-center bg-black text-white p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 bg-neutral-900 border border-neutral-800 rounded-xl p-6"
      >
        <div>
          <Heading as="h1" className="text-xl font-semibold">{t('voice.voicePage.title')}</Heading>
          <Text as="p" size="sm" className="text-neutral-400 mt-1">{t('voice.voicePage.hint')}</Text>
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
