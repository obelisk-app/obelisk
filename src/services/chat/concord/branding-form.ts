import type { ConcordArtworkPreset } from '@/constants/chat/concord-artwork';
import { parseConcordArtwork } from '@/schemas/chat/concord-artwork';
import { concordArtworkMetadata } from '@/utils/chat/concord/artwork';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import type { RelayBranding } from '@/services/relay/relay-branding';

export function concordBrandingForm(community: ConcordCommunity, branding: RelayBranding, onSaved: () => void): FormSpec<{
  name: string; description: string; picture: string; banner: string; pictureFile: File | null; bannerFile: File | null; iconPreset: ConcordArtworkPreset | ''; bannerPreset: ConcordArtworkPreset | '';
  iconEdited: boolean; bannerEdited: boolean;
}> {
  const initial = parseConcordArtwork(community.state$?.value.metadata?.custom);
  return {
    initial: { name: branding.name, description: branding.description, picture: branding.icon, banner: branding.banner, pictureFile: null, bannerFile: null, iconPreset: initial.icon, bannerPreset: initial.banner, iconEdited: false, bannerEdited: false },
    ready: values => !!values.name.trim(),
    submit: async values => {
      if (values.pictureFile && !values.iconPreset) await community.setCommunityImage('icon', values.pictureFile);
      if (values.bannerFile && !values.bannerPreset) await community.setCommunityImage('banner', values.bannerFile);
      const custom = community.state$?.value.metadata?.custom;
      const current = parseConcordArtwork(custom);
      const icon = values.iconEdited ? values.iconPreset : current.icon;
      const banner = values.bannerEdited ? values.bannerPreset : current.banner;
      const artworkChanged = current.icon !== icon || current.banner !== banner;
      await community.admin.editMetadata({
        name: values.name.trim(),
        description: values.description,
        ...(artworkChanged && { custom: concordArtworkMetadata(custom, icon, banner) }),
        ...(values.iconEdited && icon && { icon: undefined }),
        ...(values.bannerEdited && banner && { banner: undefined }),
      });
    },
    onSuccess: onSaved, failure: 'chat.concord.failed',
  };
}
