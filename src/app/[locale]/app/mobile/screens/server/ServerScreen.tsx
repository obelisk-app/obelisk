'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import { Fragment, useMemo, useRef, useState } from 'react';
import {
  nostrActions,
  useGroups,
  useChildrenByParent,
  useConfiguredRelays,
  useCurrentRelayUrl,
  useRelayAccess,
  useConnectionState,
  useGroupMetadataEose,
  useActiveCallByChannel,
  type JsGroup,
} from '@/services/nostr-bridge';
import { applyLayout } from '@/services/relay/channel-layout';
import { useTranslations } from 'next-intl';
import { categoryLabel } from '@/utils/relay/category-label';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { MobileServerRail } from '../../rail/MobileServerRail';
import { MobileServerBanner } from '../../rail/MobileServerBanner';
import { AddRelaySheet } from '../../sheets/relay/AddRelaySheet';
import { CreateChannelSheet } from '../../sheets/channel/CreateChannelSheet';
import { RelayMenuSheet } from '../../sheets/relay/RelayMenuSheet';
import { useScreenScrollMemo } from '@/hooks/shell/mobile/carousel/useScreenScrollMemo';
import { useRelayOperatorData } from '@/hooks/relay/useRelayOperatorData';
import { useForumCollapsed } from '@/hooks/shell/mobile/screens/server/useForumCollapsed';
import { useRelayHeaderInfo } from '@/hooks/relay/useRelayHeaderInfo';
import { ChannelRow, ForumThreadChildRow } from './ChannelRow';
import { ChannelListEmptyState } from './ChannelListEmptyState';

export function ServerScreen({
  go,
  selectGroup,
}: {
  go: (s: ScreenName) => void;
  selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
}) {
  const t = useTranslations();
  const groups = useGroups();
  const relay = useCurrentRelayUrl();
  const relayAccess = useRelayAccess(relay || null);
  const connectionState = useConnectionState();
  const metadataEose = useGroupMetadataEose();
  const relays = useConfiguredRelays();
  const calls = useActiveCallByChannel();
  const [addRelayOpen, setAddRelayOpen] = useState(false);
  const [relayMenuFor, setRelayMenuFor] = useState<{ url: string; label: string; iconUrl: string | null } | null>(null);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const { forumCollapsed, toggleForumCollapsed } = useForumCollapsed();
  const channelListRef = useRef<HTMLDivElement>(null);
  useScreenScrollMemo(`server:${relay ?? ''}`, channelListRef);

  const activeRelayInfo = useRelayHeaderInfo(relay);

  // Match the desktop's exact roots/layout pipeline so categories render the
  // same as ServerRail. Critically: a group whose parent isn't in the local
  // store still counts as a root.
  const groupsById = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g])),
    [groups],
  );
  const roots = useMemo(
    () => groups.filter((g) => !g.parent || !groupsById[g.parent]),
    [groups, groupsById],
  );
  const childrenByParent = useChildrenByParent();

  // Relay-wide settings trust the validated human operator identity only;
  // roles and emojis are fanned into the chat store by the shared hook.
  const { isRelayOperator, layout, branding, emojiSet, relayRoles } = useRelayOperatorData(relay);
  const laidOut = useMemo(
    () => applyLayout(layout, roots.map((g) => g.id)),
    [layout, roots],
  );

  // Renders a single channel row, plus - for forum containers with thread
  // children - the inline thread list when the user has expanded it. Used by
  // both the categorised and uncategorised lists below.
  const renderChannel = (g: JsGroup) => {
    if (g.kind === 'forum') {
      const childIds = childrenByParent[g.id] ?? [];
      const expandable = childIds.length > 0;
      const isExpanded = expandable && !forumCollapsed[g.id];
      return (
        <Fragment key={g.id}>
          <ChannelRow
            group={g}
            live={!!calls[g.id]}
            onClick={() => selectGroup(g.id, g.kind)}
            expandable={expandable}
            expanded={isExpanded}
            onToggleExpand={expandable ? () => toggleForumCollapsed(g.id) : undefined}
          />
          {isExpanded && (
            <div className="forum-threads">
              {childIds.map((cid) => {
                const child = groupsById[cid];
                if (!child) return null;
                return (
                  <ForumThreadChildRow
                    key={cid}
                    group={child}
                    active={false}
                    onClick={() => selectGroup(child.id, child.kind)}
                  />
                );
              })}
            </div>
          )}
        </Fragment>
      );
    }
    return (
      <ChannelRow
        key={g.id}
        group={g}
        live={!!calls[g.id]}
        onClick={() => selectGroup(g.id, g.kind)}
      />
    );
  };

  // Active "space" label - prefer the operator-published kind-30078 branding
  // name (matches desktop banner), fall back to NIP-11 doc, then to the URL
  // host while everything resolves.
  const activeSpaceLabel = branding.name || activeRelayInfo.name || (relay ? shortHost(relay) : 'Obelisk'); // i18n-exempt: brand name
  const activeSpaceIcon = branding.icon || activeRelayInfo.icon || null;
  const activeSpaceBanner = branding.banner || null;
  const openActiveRelayMenu = () => {
    if (!relay) return;
    setRelayMenuFor({ url: relay, label: activeSpaceLabel, iconUrl: activeSpaceIcon });
  };

  return (
    <div className="screen active" data-screen="server">
      <div className="server-mobile-layout">
        <MobileServerRail
          relays={relays}
          activeRelay={relay}
          onSelectRelay={(url) => {
            if (normalizeRelayUrl(url) !== normalizeRelayUrl(relay ?? '')) void nostrActions.switchRelay(url);
          }}
          onAddRelay={() => setAddRelayOpen(true)}
          onLongPress={(info) => setRelayMenuFor(info)}
        />

        <section className="server-channel-pane" data-testid="mobile-channel-menu">
          <MobileServerBanner
            label={activeSpaceLabel}
            relayUrl={relay}
            iconUrl={activeSpaceIcon}
            bannerUrl={activeSpaceBanner}
            onSearch={() => go('search')}
            onCreateChannel={() => { if (relay) setCreateChannelOpen(true); }}
            onOpenMenu={openActiveRelayMenu}
          />

          <div className="channel-list native-scroll-y" ref={channelListRef}>
        {laidOut.categories.map((cat) => {
          const list = cat.channelIds
            .map((id) => groupsById[id])
            .filter((g): g is JsGroup => !!g);
          const collapsed = !!collapsedCats[cat.id];
          return (
            <div key={cat.id} data-cat-id={cat.id}>
              <button
                className="channel-section-label collapsible"
                onClick={() => setCollapsedCats((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
              >
                <span>{categoryLabel(cat.name, t)} · {list.length}</span>
                <span className={`cat-caret ${collapsed ? '' : 'expanded'}`} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
                </span>
              </button>
              {!collapsed && list.map(renderChannel)}
              {!collapsed && list.length === 0 && (
                <div className="cat-empty">{t('mobile.channels.empty')}</div>
              )}
            </div>
          );
        })}
        {laidOut.uncategorized.length > 0 && (
          <div data-cat-id="__other">
            {laidOut.categories.length > 0 && (
              <button
                className="channel-section-label collapsible"
                onClick={() => setCollapsedCats((c) => ({ ...c, __other: !c.__other }))}
              >
                <span>{t('mobile.layout.uncategorizedCount', { count: laidOut.uncategorized.length })}</span>
                <span className={`cat-caret ${collapsedCats.__other ? '' : 'expanded'}`} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
                </span>
              </button>
            )}
            {!collapsedCats.__other && laidOut.uncategorized
              .map((id) => groupsById[id])
              .filter((g): g is JsGroup => !!g)
              .map(renderChannel)}
          </div>
        )}
        {roots.length === 0 && (
          <ChannelListEmptyState
            relayAccess={relayAccess}
            connectionState={connectionState}
            metadataEose={metadataEose}
          />
        )}
          </div>
        </section>
      </div>

      {addRelayOpen && <AddRelaySheet close={() => setAddRelayOpen(false)} />}
      {createChannelOpen && relay && (
        <CreateChannelSheet
          relayLabel={activeSpaceLabel}
          close={() => setCreateChannelOpen(false)}
          onCreated={(id) => selectGroup(id, 'text')}
        />
      )}
      {relayMenuFor && (
        <RelayMenuSheet
          close={() => setRelayMenuFor(null)}
          relayUrl={relayMenuFor.url}
          label={relayMenuFor.label}
          iconUrl={relayMenuFor.iconUrl}
          isAdmin={isRelayOperator}
          branding={branding}
          emojiSet={emojiSet}
          roles={relayRoles}
          layout={layout}
          rootChannels={roots}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 04 - channel (chat)
