import type { BridgeImpl } from '@/services/nostr-bridge';
import { uploadToBlossom } from '@/services/media/blossom';
import type { ProfileFormValues, ProfileUploading } from '@/types/session/profile';
import { CodedError } from '@/utils/errors/codes';

/** Upload and publish a profile only for the account that started the edit. */
export async function updateSessionProfile(
  bridge: BridgeImpl,
  values: ProfileFormValues,
  onUploading?: (which: ProfileUploading) => void,
): Promise<void> {
  const pubkey = bridge.getPublicKey();
  const generation = bridge.getSessionGeneration();
  if (!pubkey || !bridge.isLoggedIn.get() || !bridge.myLoginMethod.get() || (bridge.myLoginMethod.get() === 'bunker' && !bridge.bunkerSignerReady.get())) {
    throw new CodedError('not-logged-in', 'Not logged in');
  }
  const assertCurrent = () => {
    if (bridge.getSessionGeneration() !== generation || bridge.getPublicKey() !== pubkey || !bridge.isLoggedIn.get()) {
      throw new DOMException('Session operation was superseded', 'AbortError');
    }
  };
  const uploadOptions = {
    assertCurrent,
    signEventTemplate: async (template: Parameters<BridgeImpl['signEventTemplate']>[0]) => {
      assertCurrent();
      const event = await bridge.signEventTemplate(template);
      assertCurrent();
      if (event.pubkey !== pubkey) throw new DOMException('Signing account was replaced', 'AbortError');
      return event;
    },
  };
  try {
    let picture = values.picture.trim();
    let banner = values.banner.trim();
    if (values.pictureFile) {
      onUploading?.('picture');
      picture = await uploadToBlossom(values.pictureFile, undefined, uploadOptions);
      assertCurrent();
    }
    if (values.bannerFile) {
      onUploading?.('banner');
      banner = await uploadToBlossom(values.bannerFile, undefined, uploadOptions);
      assertCurrent();
    }
    onUploading?.(null);
    assertCurrent();
    const name = values.name.trim();
    await bridge.editUserMetadata({
      name, displayName: name, about: values.about.trim(), picture, banner,
      nip05: values.nip05.trim(), lud16: values.lud16.trim(), website: values.website.trim(),
    }, { assertCurrent });
    assertCurrent();
  } finally {
    onUploading?.(null);
  }
}
