import type { FormSpec } from '@/types/common/form';
import { trimmedValues } from '@/utils/common/form-values';
import { publishBranding, type RelayBranding } from './relay-branding';

export type RelayBrandingValues = Pick<RelayBranding, 'icon' | 'banner' | 'name' | 'description'>;

/**
 * The relay branding editor (`RelayBrandingModal` on desktop,
 * `EditBrandingSheet` on the phone): the current branding to start from,
 * every field trimmed and stamped with a fresh `updatedAt`, published as the
 * kind 30078 branding doc, then `onSaved`.
 */
export function relayBrandingForm(relayUrl: string, branding: RelayBranding, onSaved: () => void): FormSpec<RelayBrandingValues> {
  return {
    initial: () => ({ icon: branding.icon, banner: branding.banner, name: branding.name, description: branding.description }),
    submit: (values) => publishBranding(relayUrl, { ...trimmedValues(values), updatedAt: Math.floor(Date.now() / 1000) }),
    failure: 'mobile.branding.saveFailed',
    onSuccess: () => onSaved(),
  };
}
