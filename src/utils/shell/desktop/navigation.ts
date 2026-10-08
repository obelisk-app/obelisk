import { initialNav } from '@/constants/shell/mobile';
import type { NavState } from '@/utils/shell/mobile/url-state';
import type { View } from './view';

/** Desktop renders phone-only destinations over their nearest available parent. */
export function viewForNav(nav: NavState): View {
  const screen = nav.screen === 'msg-actions' ? nav.baseScreen : nav.screen;
  if (screen === 'dm-thread' || screen === 'dms-list' || screen === 'compose-dm') {
    return { kind: 'dm', peer: nav.dmPeer };
  }
  if (nav.groupId) return { kind: 'group', groupId: nav.groupId };
  if (screen === 'feed' || nav.parentScreen === 'feed') return { kind: 'feed' };
  if (nav.parentScreen === 'dms-list' || nav.parentScreen === 'dm-thread') {
    return { kind: 'dm', peer: nav.dmPeer };
  }
  return { kind: 'empty' };
}

/** A new desktop destination starts fresh, without stale phone screen parameters. */
export function navForView(view: View): NavState {
  if (view.kind === 'group') return { ...initialNav, screen: 'channel', groupId: view.groupId };
  if (view.kind === 'dm') return { ...initialNav, screen: view.peer ? 'dm-thread' : 'dms-list', dmPeer: view.peer };
  if (view.kind === 'feed') return { ...initialNav, screen: 'feed' };
  return { ...initialNav };
}
