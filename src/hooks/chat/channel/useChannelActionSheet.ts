'use client';

import { useState } from 'react';
import type { ChannelActionsTarget } from './useChannelActions';
import { useChannelMenuActions } from './useChannelMenuActions';

export type ChannelSheetView = 'main' | 'mute' | 'notify';

/** The phone channel sheet's view model: the menu's closing actions and which drill-in view shows. */
export function useChannelActionSheet(target: ChannelActionsTarget, onClose: () => void) {
  const actions = useChannelMenuActions(target, onClose);
  const [view, setView] = useState<ChannelSheetView>('main');
  return { ...actions, view, showView: setView };
}
