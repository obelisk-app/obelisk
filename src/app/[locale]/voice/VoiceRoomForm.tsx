'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useForm } from '@/hooks/common/useForm';
import { voiceJoinForm } from '@/services/voice/join-form';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import Input from '@/components/ui/forms/Input';
import CenteredPage from '@/components/ui/layout/CenteredPage';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/** Pick a room name and open it. */
export default function VoiceRoomForm() {
  const t = useTranslations();
  const router = useRouter();
  const form = useForm(voiceJoinForm((path) => router.push(path)));

  return (
    <CenteredPage>
      <Form form={form} layout="card">
        <div>
          <Heading as="h1" className="text-xl font-semibold">{t('voice.voicePage.title')}</Heading>
          <Text as="p" size="sm" className="text-neutral-400 mt-1">{t('voice.voicePage.hint')}</Text>
        </div>
        <Input
          type="text"
          {...form.field('room')}
          placeholder={t('voice.voicePage.roomPlaceholder')}
          aria-label={t('voice.voicePage.roomPlaceholder')}
          className="font-mono"
        />
        <FormActions submitLabel={t('voice.voicePage.enter')} />
      </Form>
    </CenteredPage>
  );
}
