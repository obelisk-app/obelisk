'use client';

import Text from '@/components/ui/layout/Text';
import Row from '@/components/ui/layout/Row';
import { useUserMetadata as useProfile } from '@/services/nostr-bridge';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { hexToNpub } from '@nostr-wot/data';
import { useCopyToClipboard } from '@/hooks/common/useCopyToClipboard';
import { useManageMemberRow } from '@/hooks/chat/members/useManageMemberRow';
import { useTranslations } from 'next-intl';
import { Avatar } from '../../desktop/Avatar';
import Button from '@/components/ui/buttons/Button';
import FormError from '@/components/ui/forms/FormError';
import { MemberRoleBadge } from './MemberRoleBadge';

// Exported for tests only: mounted internally by ChannelSettingsModal.
export function ManageMemberRow({ groupId, pubkey, isAdmin }: { groupId: string; pubkey: string; isAdmin: boolean }) {
  const t = useTranslations();
  const meta = useProfile(pubkey);
  // Which destructive action this row is currently asking about. An inline
  // confirm keeps the question attached to the row it's about; a
  // `window.confirm` dialog names a person out of context and blocks the tab.
  const { confirming, busy, error, ask, cancel, confirmPending } = useManageMemberRow(groupId, pubkey);
  const { copy, copied } = useCopyToClipboard();
  const name = meta?.displayName || meta?.name || shortNpubLabel(pubkey);
  const npub = hexToNpub(pubkey);

  if (confirming) {
    const demoting = confirming === 'demote';
    const promoting = confirming === 'promote';
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-black px-2 py-1.5"
        data-testid={`member-confirm-${pubkey}`}
      >
        <Text size="xs" tone="default" className="min-w-0 flex-1 truncate">
          {promoting ? t('chat.channelSettings.confirmPromote', { name }) : demoting ? t('shell.desktop.members.confirmDemote', { name }) : t('shell.desktop.members.confirmRemove', { name })}
        </Text>
        <Button
          variant="outlinePill"
          size="xs"
          onClick={cancel}
          className="shrink-0"
          data-testid={`member-confirm-cancel-${pubkey}`}
        >
          {t('common.cancel')}
        </Button>
        <Button
          variant={demoting || promoting ? 'outlinePill' : 'danger'}
          size="xs"
          onClick={confirmPending}
          className="shrink-0"
          data-testid={`member-confirm-ok-${pubkey}`}
        >
          {promoting ? t('chat.channelSettings.promote') : demoting ? t('common.confirm.demote') : t('common.confirm.remove')}
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-lc-card">
      <Avatar pubkey={pubkey} size={7} picture={meta?.picture ?? null} />
      <div className="min-w-0 flex-1">
        <Row gap="1.5" align="center">
          <Text size="sm" tone="default" className="truncate">{name}</Text>
          <MemberRoleBadge isAdmin={isAdmin} />
        </Row>
        <Button
          variant="bare"
          type="button"
          onClick={() => copy(npub)}
          title={npub}
          className="block max-w-full truncate font-mono text-[10px] text-lc-muted hover:text-lc-white"
          data-testid={`member-npub-${pubkey}`}
        >
          {copied ? t('shell.desktop.members.copied') : npub}
        </Button>
      </div>
      {/* Dimmed until the row is hovered or something inside it has focus, so
          a long member list isn't a wall of red text. `focus-within` keeps it
          reachable by keyboard. */}
      <FormError>{error}</FormError>
      <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {!isAdmin && (
          <Button type="button" variant="outlinePill" size="xs" disabled={busy} onClick={() => ask('promote')}>
            {t('chat.channelSettings.promote')}
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="outlinePill"
            size="xs"
            disabled={busy}
            onClick={() => ask('demote')}
            title={t('shell.desktop.members.demoteHelp')}
            aria-label={t('shell.desktop.members.demoteLabel', { name })}
            data-testid={`member-demote-${pubkey}`}
          >
            {t('mobile.members.demote')}
          </Button>
        )}
        <Button
          variant="outlinePill"
          size="xs"
          tone="danger"
          disabled={busy}
          onClick={() => ask('remove')}
          aria-label={t('shell.desktop.members.removeLabel', { name })}
          data-testid={`member-remove-${pubkey}`}
        >
          {t('shell.desktop.members.remove')}
        </Button>
      </div>
    </div>
  );
}
