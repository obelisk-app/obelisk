import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { setDmOptInEnabled } from '@/services/chat/dm/opt-in';
import { useDmOptInEnabled } from '@/hooks/chat/dm/unlock/useDmOptInEnabled';
import { disconnect, replayHints } from '@/services/shell/mobile/settings-actions';
import { useCanInvite } from '@/hooks/settings/invite/useCanInvite';

/** The preferences sub-screens that replace the list while open. */
export type SettingsPrefsView = 'main' | 'appearance' | 'data' | 'invites';

/**
 * The phone preferences screen: which sub-screen is open (appearance, data
 * on this device, invite people when the relay allows it), the media library, the DM opt-in toggle, replaying the
 * hints, and the disconnect confirmation.
 */
export function useSettingsPrefsScreen() {
  const t = useTranslations();
  const dmOptInEnabled = useDmOptInEnabled();
  const canInvite = useCanInvite();
  const [view, setView] = useState<SettingsPrefsView>('main');
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  return {
    view,
    openView: setView,
    closeView: () => setView('main'),
    canInvite,
    dmOptInEnabled,
    toggleDms: () => setDmOptInEnabled(!dmOptInEnabled),
    replayHints: () => replayHints(t('shell.hints.replayed')),
    mediaLibraryOpen,
    openMediaLibrary: () => setMediaLibraryOpen(true),
    closeMediaLibrary: () => setMediaLibraryOpen(false),
    confirmingLogout,
    askLogout: () => setConfirmingLogout(true),
    cancelLogout: () => setConfirmingLogout(false),
    confirmLogout: () => {
      setConfirmingLogout(false);
      disconnect();
    },
  };
}
