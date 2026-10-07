'use client';

import { useEffect, useLayoutEffect } from 'react';
import { nostrActions, useBridge } from '@/services/nostr-bridge';
import { subscribeVoiceJump } from '@/services/voice/jump-to-voice';
import { emojiTagsForContent, mergeCustomEmojiMaps, type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import { onOpenSettings, revealSettingsSection } from '@/utils/settings/open-settings';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/chat/dm';
import type { NavState, ScreenName } from '@/utils/shell/mobile/url-state';

type PushNav = (updater: (n: NavState) => NavState, dir?: 'forward' | 'back') => void;

/**
 * Requests to move the phone shell that come from outside the screens host:
 * the status pill's "Manage these relays" and the voice bar's "jump back to
 * call". Neither can reach `go` / `pushNav`, so both ask through a pub/sub.
 */
export function useExternalNavigation(
  go: (screen: ScreenName) => void,
  pushNav: PushNav,
  currentRelayUrl: string | null | undefined,
) {
  // "Manage these relays" from the status pill in the server banner. The
  // banner sits outside the screens host, same as the voice bar below, so it
  // asks through the settings pub/sub rather than reaching for `go`.
  useEffect(() => onOpenSettings(({ section }) => {
    go(section === 'profile' ? 'settings-profile' : 'settings-prefs');
    revealSettingsSection(section);
  }), [go]);

  // VoiceStatusBar "jump back to call": the bar lives outside the screens host
  // and can't reach `pushNav` directly, so it dispatches through the
  // jump-to-voice pub/sub. Mirror the DesktopShell handler, switch relay
  // first if the call's home relay differs, then push the voice-room screen.
  useEffect(() => {
    return subscribeVoiceJump(async ({ channelId, relayUrl }) => {
      if (relayUrl && currentRelayUrl && relayUrl !== currentRelayUrl) {
        try { await nostrActions.switchRelay(relayUrl); }
        catch (err) { console.warn('[mobile] switchRelay for voice jump failed', err); }
      }
      useChatStore.setState({ activeChannelId: null });
      useDMStore.setState({ activeDMPubkey: null });
      // Voice jump originates from outside the shell (status bar etc.), no
      // meaningful entry parent. Anchor to 'server' so the highlight + swipe
      // behave like opening voice from the channel list.
      pushNav((n) => ({
        ...n,
        screen: 'voice-room',
        groupId: channelId,
        dmPeer: null,
        profilePubkey: null,
        forumGroupId: null,
        baseScreen: null,
        msgContext: null,
        parentScreen: 'server',
      }));
    });
  }, [currentRelayUrl, pushNav]);
}

/** Mirror the watched channel and DM thread into the bridge and the stores. */
export function useActiveConversationMirror(nav: NavState, dmOptInEnabled: boolean) {
  // Mirror the watched channel into the bridge. Without this:
  //   1) the active-channel priority gate (background message-queue drain
  //      pauses while the active channel is in 'loading') never engages
  //      on mobile, the watched channel doesn't get its bandwidth boost.
  //   2) Re-entering a channel that was previously declared
  //      `empty-confirmed` doesn't auto-restart its kind 9 sub, so the
  //      user sees "No messages yet" flash before the bridge gets a
  //      chance to recover.
  //
  // useLayoutEffect (not useEffect): the bridge's setActiveGroup flips
  // status to 'loading' synchronously when it restarts a stale empty
  // channel. Running before paint means the chat panel's first paint
  // already reflects 'loading' instead of the stale 'empty-confirmed'.
  // The bridge is called directly rather than through the async
  // `nostrActions.setActiveGroup` so the status flip lands in this commit,
  // not a later microtask. It comes from the provider and is null until it
  // has started, so the effect runs again when it arrives.
  const bridge = useBridge();
  useLayoutEffect(() => {
    if (!bridge) return;
    if (nav.screen === 'channel' && nav.groupId) {
      bridge.setActiveGroup(nav.groupId);
    } else {
      bridge.setActiveGroup(null);
    }
  }, [nav.screen, nav.groupId, bridge]);

  useEffect(() => {
    useDMStore.setState({
      activeDMPubkey: dmOptInEnabled && nav.screen === 'dm-thread' ? nav.dmPeer : null,
    });
  }, [dmOptInEnabled, nav.screen, nav.dmPeer]);
}

/** Send the reaction the msg-actions sheet emits (`obelisk-mobile:react`). */
export function useMobileReactionSender(groupId: string | null, serverEmojis: CustomEmojiMap) {
  useEffect(() => {
    const handler = async (e: Event) => {
      const ev = e as CustomEvent<{
        msg: { id: string; pubkey: string };
        emoji: string;
        customEmojis?: CustomEmojiMap;
      }>;
      if (!groupId) return;
      try {
        const emojiTags = emojiTagsForContent(
          ev.detail.emoji,
          mergeCustomEmojiMaps(serverEmojis, ev.detail.customEmojis),
        );
        await nostrActions.sendReaction(
          ev.detail.msg.id,
          ev.detail.msg.pubkey,
          ev.detail.emoji,
          groupId,
          emojiTags,
        );
      } catch (err) { console.warn('[mobile] react failed', err); }
    };
    window.addEventListener('obelisk-mobile:react', handler);
    return () => window.removeEventListener('obelisk-mobile:react', handler);
  }, [groupId, serverEmojis]);
}
