'use client';
import { useTranslations } from 'next-intl';
import SegmentedControl from '@/components/ui/forms/SegmentedControl';
import Text from '@/components/ui/layout/Text';
export default function CommunityTypePicker({ value, onChange }: { value: 'standard' | 'encrypted'; onChange: (value: 'standard' | 'encrypted') => void }) {
  const t = useTranslations();
  return <div className="space-y-2 px-5 py-4">
    <SegmentedControl aria-label={t('chat.concord.communityType')} fit="fill" value={value} onChange={onChange} options={[
      { value: 'standard', label: t('chat.concord.standard') },
      { value: 'encrypted', label: t('chat.concord.encrypted') },
    ]} />
    <Text as="p" size="xs" tone="muted">{t(value === 'encrypted' ? 'chat.concord.encryptedHelp' : 'chat.concord.standardHelp')}</Text>
  </div>;
}
