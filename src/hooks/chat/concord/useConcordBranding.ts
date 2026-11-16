import { useEffect, useState } from 'react';
import type { BlobPointer } from '@applesauce/concord';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { openConcordImage } from '@/services/chat/concord/branding';
import { PERM } from '@/constants/chat/concord';

export function useConcordBranding(community: ConcordCommunity, includeBanner = true) {
  const [state, setState] = useState(community.state$.value);
  const [images, setImages] = useState<{ key: string; icon: string; banner: string } | null>(null);
  const metadata = state.metadata;
  const imageKey = JSON.stringify([community.communityId, metadata?.icon, includeBanner ? metadata?.banner : null]);
  useEffect(() => { const sub = community.state$.subscribe(setState); return () => sub.unsubscribe(); }, [community]);
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    const [, iconPointer, bannerPointer] = JSON.parse(imageKey) as [string, BlobPointer | null, BlobPointer | null];
    const load = async (pointer: BlobPointer | null) => {
      if (!pointer) return '';
      try { const url = await openConcordImage(pointer); if (!active) { URL.revokeObjectURL(url); return ''; } urls.push(url); return url; } catch { return ''; }
    };
    void Promise.all([load(iconPointer), load(bannerPointer)]).then(([icon, banner]) => { if (active) setImages({ key: imageKey, icon, banner }); });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [imageKey]);
  return { branding: { name: metadata?.name ?? community.material.name, description: metadata?.description ?? '',
    icon: images?.key === imageKey ? images.icon : '', banner: images?.key === imageKey ? images.banner : '', updatedAt: 0 },
    canEdit: community.canDo(PERM.MANAGE_METADATA),
  };
}
