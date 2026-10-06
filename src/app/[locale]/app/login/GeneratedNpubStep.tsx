'use client';

import { Modal } from '@nostr-wot/ui';
import { nip19 } from 'nostr-tools';
import { useTranslations } from 'next-intl';

type Props = {
  pubkey: string;
  onClose: () => void;
  onBack: () => void;
  shared: boolean;
  onShare: () => void;
  finishing: boolean;
  finishError: string;
  onFinish: () => void;
};

/** After generating a key: show the new npub, offer to copy or share it, then enter. */
export function GeneratedNpubStep({ pubkey, onClose, onBack, shared, onShare, finishing, finishError, onFinish }: Props) {
  const t = useTranslations();
  const npub = nip19.npubEncode(pubkey);
  return (
    <Modal
      open
      onClose={onClose}
      aria-label={t('shell.login.shareProfile')}
      classes={{ modal: 'obelisk-login-modal obelisk-share-modal' }}
    >
      <button type="button" className="nui-back obelisk-flow-back" aria-label={t('common.back')} onClick={onBack}>
        ‹
      </button>
      <div className="nui-form obelisk-npub-share" data-testid="generated-npub-step">
        <div className="nui-form-head">
          <span className="obelisk-step-done" aria-hidden="true">✓</span>
          <h3 className="nui-form-title">{t('shell.login.profileReady')}</h3>
          <p className="nui-form-sub">{t('shell.login.npubHelp')}</p>
        </div>
        <div className="nui-key-display">{npub}</div>
        <div className="obelisk-share-actions">
          <button
            type="button"
            className="nui-back obelisk-copy-npub"
            onClick={() => { void Promise.resolve(navigator.clipboard?.writeText(npub)).catch(() => {}); }}
          >
            {t('shell.login.copyNpub')}
          </button>
          {/*
            An npub is the address; a link is what people can actually open.
            Same share path as a note, the Obelisk profile viewer, which
            renders OG metadata so the link previews wherever it's pasted,
            instead of landing the recipient on a third-party site.
          */}
          <button
            type="button"
            className="nui-back obelisk-share-profile"
            onClick={onShare}
            data-testid="share-generated-profile"
          >
            {shared ? t('shell.login.linkCopied') : t('shell.login.shareMyProfile')}
          </button>
        </div>
        {finishError && <p className="nui-error" role="alert">{finishError}</p>}
        <button type="button" className="nui-login-button" disabled={finishing} onClick={onFinish}>
          {finishing ? t('shell.login.connecting') : t('shell.login.enter')}
        </button>
      </div>
    </Modal>
  );
}
