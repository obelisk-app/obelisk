import { concordArtworkUrl } from '@/assets/illustrations/concord';
import type { ConcordArtworkPreset } from '@/constants/chat/concord-artwork';
import { parseConcordArtwork } from '@/schemas/chat/concord-artwork';
import { useEffect, useRef } from 'react';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { RelayBranding } from '@/services/relay/relay-branding';
import { concordBrandingForm } from '@/services/chat/concord/branding-form';
import { CONCORD_ATTACHMENT_BYTE_LIMIT } from '@/constants/nostr-bridge/concord';
import { useForm } from '@/hooks/common/useForm';

export function useConcordBrandingForm(community: ConcordCommunity, branding: RelayBranding, onSaved: () => void) {
  const form = useForm(concordBrandingForm(community, branding, onSaved));
  const previews = useRef<string[]>([]);
  useEffect(() => { const urls = previews.current; return () => urls.forEach(url => URL.revokeObjectURL(url)); }, []);
  const current = parseConcordArtwork(community.state$.value.metadata?.custom);
  const selectPreset = (slot: 'icon' | 'banner', preset: ConcordArtworkPreset | '') => {
    if (slot === 'icon') {
      form.setValues({ iconPreset: preset, iconEdited: true, pictureFile: null, picture: concordArtworkUrl(preset, 'icon') || (current.icon ? '' : branding.icon) });
    } else {
      form.setValues({ bannerPreset: preset, bannerEdited: true, bannerFile: null, banner: concordArtworkUrl(preset, 'banner') || (current.banner ? '' : branding.banner) });
    }
  };
  return { form, selectPreset, uploadFile: async (file: File, slot: 'picture' | 'banner') => {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > CONCORD_ATTACHMENT_BYTE_LIMIT) throw new Error('Unsupported image');
    if (slot === 'picture') form.setValues({ pictureFile: file, iconPreset: '', iconEdited: true });
    else form.setValues({ bannerFile: file, bannerPreset: '', bannerEdited: true });
    const url = URL.createObjectURL(file); previews.current.push(url); return url;
  } };
}
