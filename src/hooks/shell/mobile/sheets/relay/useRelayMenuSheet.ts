import { useToastStore } from '@/store/feedback/toast';
import { writeClipboardText } from '@/services/common/clipboard';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConfiguredRelays } from '@/services/nostr-bridge';
import { confirmLeaveRelay, leaveRelay, shareRelayInvite } from '@/services/shell/mobile/relay-menu';

/** The admin panels the relay menu can stack over itself. */
export type RelayMenuPanel = 'branding' | 'emojis' | 'categories' | 'members' | 'roles';

/**
 * The phone relay menu: invite, share, copy URL and leave, each with its
 * busy hint and shared confirmation toast, and which admin panel is open.
 */
export function useRelayMenuSheet({ relayUrl, label, close }: { relayUrl: string; label: string; close: () => void }) {
  const t = useTranslations();
  const relays = useConfiguredRelays();
  const [busy, setBusy] = useState<string | null>(null);
  const [adminPanel, setAdminPanel] = useState<RelayMenuPanel | null>(null);

  const flash = (msg: string) => {
    useToastStore.getState().pushToast({ title: msg, body: '' });
  };
  const inviteText = t('mobile.space.inviteText', { name: label, url: relayUrl });

  const invite = async () => {
    setBusy('invite');
    try {
      await writeClipboardText(inviteText);
      flash(t('mobile.space.inviteCopied'));
    } catch { /* ignore */ }
    finally { setBusy(null); }
  };

  const share = async () => {
    setBusy('share');
    try {
      const how = await shareRelayInvite({ title: label, text: inviteText, url: relayUrl });
      if (how === 'copied') flash(t('mobile.space.copiedClipboard'));
    } catch { /* user cancelled or unsupported */ }
    finally { setBusy(null); }
  };

  const copyUrl = async () => {
    try {
      await writeClipboardText(relayUrl);
      flash(t('mobile.space.urlCopied'));
    } catch { /* ignore */ }
  };

  const leave = async () => {
    if (!(await confirmLeaveRelay(t, label))) return;
    setBusy('leave');
    try {
      await leaveRelay(relayUrl, relays);
      close();
    } catch (err) {
      console.warn('[mobile] leave relay failed', err);
    } finally { setBusy(null); }
  };

  return {
    relays,
    busy,
    adminPanel,
    openPanel: setAdminPanel,
    closePanel: () => setAdminPanel(null),
    invite: () => void invite(),
    share: () => void share(),
    copyUrl: () => void copyUrl(),
    leave: () => void leave(),
  };
}
