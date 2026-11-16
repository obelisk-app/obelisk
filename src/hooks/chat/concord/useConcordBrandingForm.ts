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
  return { form, uploadFile: async (file: File, slot: 'picture' | 'banner') => {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > CONCORD_ATTACHMENT_BYTE_LIMIT) throw new Error('Unsupported image');
    form.set(slot === 'picture' ? 'pictureFile' : 'bannerFile', file);
    const url = URL.createObjectURL(file); previews.current.push(url); return url;
  } };
}
