'use client';

/** The destinations of the relay settings menu, in the order it lists them. */
export type RelaySettingsKind = 'profile' | 'emoji' | 'channels' | 'roles' | 'members' | 'invite' | 'createChannel';

/**
 * The relay settings menu: one entry per operator tool. Picking one closes
 * the menu, then opens that tool.
 */
export function useRelaySettingsModal({ onClose, onBranding, onEmojis, onLayout, onMembers, onRoles, onInvite, onCreateChannel }: {
  onClose: () => void;
  onInvite?: () => void;
  onCreateChannel?: () => void;
  onBranding?: () => void;
  onEmojis?: () => void;
  onLayout?: () => void;
  onMembers?: () => void;
  onRoles?: () => void;
}) {
  const entries: ReadonlyArray<readonly [RelaySettingsKind, (() => void) | undefined]> = [
    ['profile', onBranding],
    ['emoji', onEmojis],
    ['channels', onLayout],
    ['roles', onRoles],
    ['members', onMembers],
    ['createChannel', onCreateChannel],
    ['invite', onInvite],
  ];
  return {
    items: entries.flatMap(([kind, action]) => action ? [{
      kind,
      open: () => {
        onClose();
        action();
      },
    }] : []),
  };
}
