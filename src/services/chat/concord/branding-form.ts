import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import type { RelayBranding } from '@/services/relay/relay-branding';

export function concordBrandingForm(community: ConcordCommunity, branding: RelayBranding, onSaved: () => void): FormSpec<{
  name: string; description: string; picture: string; banner: string; pictureFile: File | null; bannerFile: File | null;
}> {
  return {
    initial: { name: branding.name, description: branding.description, picture: branding.icon, banner: branding.banner, pictureFile: null, bannerFile: null },
    ready: values => !!values.name.trim(),
    submit: async values => {
      if (values.pictureFile) await community.setCommunityImage('icon', values.pictureFile);
      if (values.bannerFile) await community.setCommunityImage('banner', values.bannerFile);
      await community.admin.editMetadata({ name: values.name.trim(), description: values.description });
    },
    onSuccess: onSaved, failure: 'chat.concord.failed',
  };
}
