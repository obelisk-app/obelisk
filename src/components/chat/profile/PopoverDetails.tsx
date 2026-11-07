'use client';

import Link from '@/components/ui/navigation/Link';

import { useTranslations } from 'next-intl';
import { GlobeIcon, ZapIcon } from '@/assets/icons';
import type { RelayRole } from '@/services/relay/relay-roles';
import type { PopoverMember } from '@/hooks/chat/profile/usePopoverMember';
import { BASE_ROLE } from '@/constants/chat/profile';
import { websiteHref } from '@/utils/chat/profile/profile-links';

/** Roles + links, recessed so they read as details, not actions. */
export function PopoverDetails({ member, relayRoles = [] }: { member: PopoverMember | undefined; relayRoles?: readonly RelayRole[] }) {
  const t = useTranslations();
  const baseRole = member?.role ? BASE_ROLE[member.role] : undefined;
  if (!(baseRole || relayRoles.length || member?.website || member?.lud16)) return null;
  return (
    <div className="space-y-2.5 rounded-lg border border-lc-border bg-lc-black/50 p-3">
      {(baseRole || relayRoles.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="profile-roles">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">{t('chat.profilePopover.roles')}</span>
          {baseRole && <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            style={{ borderColor: baseRole.color, color: baseRole.color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: baseRole.color }} />
            {t(baseRole.key)}
          </span>}
          {relayRoles.map((role) => (
            <span key={role.id} data-role-id={role.id}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              style={{ color: role.color, borderColor: `${role.color}59`, backgroundColor: `${role.color}1f` }}
            >
              {role.emoji && <span aria-hidden="true">{role.emoji}</span>}
              {role.name}
            </span>
          ))}
        </div>
      )}
      {(member?.website || member?.lud16) && (
        <div className="space-y-1.5" data-testid="profile-links">
          {member?.website && (
            <Link native variant="text"
              href={websiteHref(member.website)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-2 truncate text-xs"
              data-testid="profile-website"
            >
              <GlobeIcon size={14} />
              {member.website.replace(/^https?:\/\//i, '')}
            </Link>
          )}
          {member?.lud16 && (
            <div className="flex items-center gap-2 break-all text-xs text-lc-white/85" data-testid="profile-lud16">
              <span className="text-lc-green"><ZapIcon size={14} /></span>
              {member.lud16}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
