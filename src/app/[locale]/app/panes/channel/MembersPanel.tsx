'use client';

import Stack from '@/components/ui/layout/Stack';
import { useMembershipReady } from '@/services/nostr-bridge';
import MemberList from '@/components/chat/members/MemberList';
import { useTranslations } from 'next-intl';

export function MembersPanel({ groupId }: { groupId: string }) {
  const t = useTranslations();
  // Members are P3 in the priority orchestrator - the lazy per-group
  // admin/member REQs fire when this panel mounts. Surface a loading state
  // until {@link useMembershipReady} flips, so the user knows the empty
  // pane is "still loading" not "no members."
  const ready = useMembershipReady(groupId);
  return (
    <>
      {ready ? (
        <MemberList groupId={groupId} />
      ) : (
        <Stack
          gap="3" align="center" className="w-60 h-full bg-lc-dark border-l border-lc-border justify-center text-sm text-lc-muted"
          data-testid="members-loading"
        >
          <div className="lc-spinner" aria-hidden="true" />
          <div>{t('shell.desktop.members.loading')}</div>
        </Stack>
      )}
    </>
  );
}

// -- Channel settings (admin) -------------------------------------------
