/**
 * Chat: profile. Values the code in `hooks/chat/profile/usePopoverMember.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { MessageKey } from '@/i18n/keys';

/** Colour per base role; the label is a key, resolved at render. */
export const BASE_ROLE: Record<string, { key: MessageKey; color: string }> = {
  owner: { key: 'admin.roles.base.owner', color: '#f59e0b' },
  admin: { key: 'admin.roles.base.admin', color: '#ef4444' },
  mod: { key: 'admin.roles.base.mod', color: '#3b82f6' },
  member: { key: 'admin.roles.base.member', color: '#737373' },
};
