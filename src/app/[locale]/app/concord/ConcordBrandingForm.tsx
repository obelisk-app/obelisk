'use client';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { RelayBranding } from '@/services/relay/relay-branding';
import { useConcordBrandingForm } from '@/hooks/chat/concord/useConcordBrandingForm';
import ChannelAppearanceInput from '@/components/media/upload/ChannelAppearanceInput';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import FormError from '@/components/ui/forms/FormError';
import Input from '@/components/ui/forms/Input';
import Text from '@/components/ui/layout/Text';
import ConcordArtworkPicker from './ConcordArtworkPicker';
import TextArea from '@/components/ui/forms/TextArea';

export default function ConcordBrandingForm({ community, branding, onSaved }: { community: ConcordCommunity; branding: RelayBranding; onSaved: () => void }) {
  const t = useTranslations();
  const vm = useConcordBrandingForm(community, branding, onSaved);
  return <Form form={vm.form} layout="stack">
    <ChannelAppearanceInput picture={vm.form.values.picture} banner={vm.form.values.banner} uploadFile={vm.uploadFile} onPictureChange={value => vm.form.set('picture', value)} onBannerChange={value => vm.form.set('banner', value)} />
    <div className="space-y-3 rounded-xl border border-lc-border bg-lc-card/40 p-3">
      <Text as="p" variant="caption">{t('chat.concord.artwork.hint')}</Text>
      <ConcordArtworkPicker slot="icon" selected={vm.form.values.iconPreset} onSelect={(preset) => vm.selectPreset('icon', preset)} />
      <ConcordArtworkPicker slot="banner" selected={vm.form.values.bannerPreset} onSelect={(preset) => vm.selectPreset('banner', preset)} />
    </div>
    <Input label={t('mobile.field.name')} data-testid="concord-community-title" {...vm.form.field('name')} />
    <TextArea label={t('mobile.field.description')} {...vm.form.field('description')} />
    <FormError>{vm.form.error}</FormError>
    <FormActions submitLabel={t('common.save')} submitTestId="concord-branding-save" busy={vm.form.submitting} disabled={!vm.form.canSubmit} />
  </Form>;
}
