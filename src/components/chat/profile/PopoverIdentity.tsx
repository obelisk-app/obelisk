'use client';

import type { Nip05State } from '@/services/nip05-verify';
import { useTranslation } from '@/i18n/context';
import { CheckBadgeIcon, CopyIcon } from '@/components/ui/icons';
import Spinner from '@/components/ui/Spinner';
import WotBadge from '../WotBadge';
import { renderWithEmojis } from './popover-emoji';
import type { PopoverMember } from './usePopoverMember';

/** Name, WoT badge, NIP-05 handle and the copyable npub. */
export function PopoverIdentity({
  pubkey,
  member,
  displayName,
  serverEmojis,
  nip05State,
  npub,
  npubShort,
  onCopyNpub,
}: {
  pubkey: string;
  member: PopoverMember | undefined;
  displayName: string;
  serverEmojis: Record<string, string>;
  nip05State: Nip05State;
  npub: string;
  npubShort: string;
  onCopyNpub: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 break-words text-lg font-semibold leading-tight text-lc-white" data-testid="profile-name">
        <span>{renderWithEmojis(displayName, serverEmojis)}</span>
        <WotBadge pubkey={pubkey} />
      </h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs" data-testid="profile-handle">
        {/*
          Three states, none of which shows a badge before the
          `.well-known/nostr.json` lookup has confirmed the handle:
          verified = green + check; checking = muted + spinner;
          unverified / unchecked = muted, nothing else. The string is a
          free-text claim until then.
        */}
        {member?.nip05 && (
          <span
            className={`flex min-w-0 items-center gap-1 ${nip05State === 'verified' ? 'text-lc-green' : 'text-lc-muted'}`}
            title={member.nip05}
            data-testid="profile-nip05"
            data-state={nip05State}
          >
            {nip05State === 'verified' && <CheckBadgeIcon size={14} />}
            {nip05State === 'checking' && (
              <Spinner size="xs" label={t('common.loading')} />
            )}
            <span className="truncate">{member.nip05.replace(/^_@/, '')}</span>
          </span>
        )}
        {npub ? (
          <button
            type="button"
            onClick={onCopyNpub}
            className="flex max-w-full items-center gap-1.5 rounded-full border border-lc-border bg-lc-black/60 px-2 py-0.5 font-mono text-[11px] text-lc-white/85 transition-colors hover:border-lc-green/50 hover:text-lc-white"
            title={t('profileFeed.copyNpub')}
            data-testid="profile-copy-npub-btn"
          >
            <span className="truncate">{npubShort}</span>
            <CopyIcon size={12} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
