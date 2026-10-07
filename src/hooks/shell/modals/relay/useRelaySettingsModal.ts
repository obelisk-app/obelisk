'use client';

/** The destinations of the relay settings menu, in the order it lists them. */
export type RelaySettingsKind = 'profile' | 'emoji' | 'channels' | 'roles' | 'members';

/**
 * The relay settings menu: one entry per operator tool. Picking one closes
 * the menu, then opens that tool.
 */
export function useRelaySettingsModal({ onClose, onBranding, onEmojis, onLayout, onMembers, onRoles }: {
  onClose: () => void;
  onBranding: () => void;
  onEmojis: () => void;
  onLayout: () => void;
  onMembers: () => void;
  onRoles: () => void;
}) {
  const entries: ReadonlyArray<readonly [RelaySettingsKind, () => void]> = [
    ['profile', onBranding],
    ['emoji', onEmojis],
    ['channels', onLayout],
    ['roles', onRoles],
    ['members', onMembers],
  ];
  return {
    items: entries.map(([kind, action]) => ({
      kind,
      open: () => {
        onClose();
        action();
      },
    })),
  };
}
