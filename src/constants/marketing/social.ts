/**
 * Obelisk's official social accounts, drawn by the landing's `SocialSection` and
 * the site footer.
 * The handles are the canonical ones listed in obelisk-design
 * (`design-system/social.md`); change them there and here together.
 */
export const SOCIAL_ACCOUNTS = [
  { id: 'instagram', network: 'Instagram', handle: '@obelisk.ar', href: 'https://www.instagram.com/obelisk.ar' }, // i18n-exempt: brand names and handles
  { id: 'youtube', network: 'YouTube', handle: '@obelisk_ar', href: 'https://www.youtube.com/@obelisk_ar' }, // i18n-exempt: brand names and handles
  { id: 'x', network: 'X', handle: '@obelisk_ar', href: 'https://x.com/obelisk_ar' }, // i18n-exempt: brand names and handles
] as const;

export type SocialAccountId = (typeof SOCIAL_ACCOUNTS)[number]['id'];
