'use client';

/**
 * DM list sidebar - visual mirror of obelisk's DMList.tsx, dropping the
 * obelisk-API user search. Uses the bridge's reactive DM thread map +
 * NIP-02 follows to split Follows / Others.
 */

import Row from '@/components/ui/layout/Row';
import { useTranslations } from 'next-intl';
import { useDmList } from '@/hooks/shell/dm/useDmList';
import type { DmListTab } from '@/utils/shell/desktop/dm-list';
import IconButton from '@/components/ui/buttons/IconButton';
import TextButton from '@/components/ui/buttons/TextButton';
import SegmentedControl from '@/components/ui/forms/SegmentedControl';
import { DmUnlock } from '@/components/chat/dm/unlock/DmUnlock';
import ComposeDm from './ComposeDm';
import { DmListRow } from './DmListRow';
import { DmTabLabel } from './DmTabLabel';
import { SearchIcon, TrashIcon } from '@/assets/icons';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

export default function DmList({
  activePeer,
  onPick,
}: {
  activePeer: string | null;
  onPick: (peer: string) => void;
}) {
  const t = useTranslations();
  const vm = useDmList(onPick);

  return (
    <aside
      className="relative flex h-full w-full flex-col overflow-hidden bg-lc-dark"
      data-tour="dm-list"
    >
      {/* Same fixed height as the thread header beside it (`DmPanel`), so the
          two bottom borders form one line across the whole surface. */}
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-lc-border px-4 shadow-sm" data-testid="dm-list-header">
        <Heading as="h3" variant="panel" className="truncate">{t('dm.title')}</Heading>
        <Row gap="1" align="center">
          <IconButton
            size="8"
            tone="danger"
            onClick={vm.explainCache}
            title={t('dm.clearCacheTitle')}
            aria-label={t('dm.clearCache')}
          >
            <TrashIcon strokeWidth={2} />
          </IconButton>
          <IconButton
            size="8"
            onClick={vm.toggleComposing}
            title={t('dm.new')}
            aria-label={t('dm.new')}
            aria-pressed={vm.composing}
          >
            <SearchIcon size={18} strokeWidth={2} />
          </IconButton>
        </Row>
      </div>

      <DmUnlock className="shrink-0 border-b border-lc-border" />

      {vm.composing && (
        <ComposeDm
          onClose={vm.closeComposer}
          onPicked={vm.pickFromComposer}
        />
      )}

      {/*
        A segmented control rather than an underlined tab strip.

        The underline read as a page-level tab bar - the same affordance the
        rail and the channel list use for navigation - when this only filters
        the list underneath it. A filled pill inside a track says "one of
        these two" and takes the same room. The count moves into its own
        badge: parentheses next to a label are easy to read as part of the
        label, and this is the number that tells you which side has anything
        in it.
      */}
      <div className="shrink-0 border-b border-lc-border p-2">
        <SegmentedControl<DmListTab>
          fit="fill"
          aria-label={t('dm.title')}
          value={vm.activeTab}
          onChange={vm.setTab}
          options={vm.tabs.map((tab) => ({
            value: tab.id,
            testId: `dm-tab-${tab.id}`,
            label: <DmTabLabel tab={tab.id} count={tab.count} active={tab.active} />,
          }))}
        />
      </div>

      {/*
        Same reservation as the channel list: `FloatingUserPanel` is absolute
        over the bottom of this column too, and this scroller had none - so
        the last conversation sat permanently behind the "You" pill.
      */}
      <div className="flex-1 overflow-y-auto pb-2 md:pb-28">
        {!vm.hasConversations && vm.loading ? null : !vm.hasConversations ? (
          <div className="p-4 text-center">
            <Text as="p" variant="muted">{t('dm.noConversations')}</Text>
            <TextButton
              onClick={vm.startComposing}
              className="mt-2 text-xs"
            >
              {t('dm.startConversation')}
            </TextButton>
          </div>
        ) : vm.visible.length === 0 ? (
          <div className="p-4 text-center">
            <Text as="p" variant="muted">
              {vm.activeTab === 'follows'
                ? t('dm.noFollows')
                : t('dm.everyoneInFollows')}
            </Text>
          </div>
        ) : (
          vm.visible.map((p) => (
            <DmListRow
              key={p.pubkey}
              pubkey={p.pubkey}
              last={p.last}
              youPrefix={t('dm.youPrefix')}
              active={activePeer === p.pubkey}
              onClick={() => onPick(p.pubkey)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
