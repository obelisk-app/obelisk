import { describe, expect, it, vi } from 'vitest';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { concordBrandingForm } from '@/services/chat/concord/branding-form';
import { createChannelForm } from '@/services/chat/channel/create-channel-form';
import { EMPTY_BRANDING } from '@/constants/relay/relay-branding';

describe('Concord community controls', () => {
  it('sends image files through the encrypted SDK, and never publishes preview URLs as metadata', async () => {
    const image = vi.fn().mockResolvedValue(undefined);
    const metadata = vi.fn().mockResolvedValue(undefined);
    const community = { setCommunityImage: image, admin: { editMetadata: metadata } } as unknown as ConcordCommunity;
    const spec = concordBrandingForm(community, EMPTY_BRANDING, vi.fn());
    const file = new File(['image'], 'banner.png', { type: 'image/png' });
    const initial = typeof spec.initial === 'function' ? spec.initial() : spec.initial;
    await spec.submit({ ...initial, name: ' Community ', description: 'Private', banner: 'blob:preview', bannerFile: file, bannerEdited: true });
    expect(image).toHaveBeenCalledWith('banner', file);
    expect(metadata).toHaveBeenCalledWith({ name: 'Community', description: 'Private' });
  });

  it('persists preset IDs without uploading bytes or replacing other community settings', async () => {
    const setCommunityImage = vi.fn();
    const editMetadata = vi.fn();
    const custom = { external: true, obelisk: { layout: { categories: [] }, artwork: { banner: 'tide' } } };
    const community = {
      setCommunityImage, admin: { editMetadata }, state$: { value: { metadata: { custom } } },
    } as unknown as ConcordCommunity;
    const spec = concordBrandingForm(community, EMPTY_BRANDING, vi.fn());
    const initial = typeof spec.initial === 'function' ? spec.initial() : spec.initial;
    await spec.submit({ ...initial, name: 'Signal Garden', iconPreset: 'bloom', iconEdited: true });
    expect(setCommunityImage).not.toHaveBeenCalled();
    expect(editMetadata).toHaveBeenCalledWith({
      name: 'Signal Garden', description: '', icon: undefined,
      custom: { external: true, obelisk: { layout: { categories: [] }, artwork: { icon: 'bloom', banner: 'tide' } } },
    });
  });

  it('routes the existing inline channel form to the selected protocol', async () => {
    const create = vi.fn().mockResolvedValue('channel');
    const spec = createChannelForm(vi.fn(), create);
    await expect(spec.submit({ name: ' general ' })).resolves.toBe('channel');
    expect(create).toHaveBeenCalledWith('general');
  });
});
