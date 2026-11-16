'use client';
import { useTranslations } from 'next-intl';
import SegmentedControl from '@/components/ui/forms/SegmentedControl';
import Text from '@/components/ui/layout/Text';
export default function CommunityTypePicker({ encrypted, onChange }: { encrypted: boolean; onChange: (value: boolean) => void }) {
  const t = useTranslations();
  return <div className="space-y-2 px-5 py-4">
    <SegmentedControl aria-label={t('chat.concord.communityType')} fit="fill" value={encrypted ? 'encrypted' : 'standard'} onChange={value => onChange(value === 'encrypted')} options={[
      { value: 'standard', label: t('chat.concord.standard') },
      { value: 'encrypted', label: t('chat.concord.encrypted') },
    ]} />
    <Text as="p" size="xs" tone="muted">{t(encrypted ? 'chat.concord.encryptedHelp' : 'chat.concord.standardHelp')}</Text>
  </div>;
}
