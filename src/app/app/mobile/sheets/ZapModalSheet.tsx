'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useState } from 'react';
import { useUserMetadata } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import { formatNumber } from '@/utils/format/format';
import { NameAvatar } from '../avatar';
import Sheet from '@/components/ui/Sheet';
import SheetActions from './SheetActions';

export function ZapModalSheet({
  msg,
  close,
}: {
  msg: { id: string; pubkey: string; content: string };
  close: () => void;
}) {
  const { t, locale } = useTranslation();
  const meta = useUserMetadata(msg.pubkey);
  const name = displayNameFor(msg.pubkey, meta);
  const [amount, setAmount] = useState(2100);
  const presets = [
    { v: 21, label: '21' },
    { v: 100, label: '100' },
    { v: 500, label: '500' },
    { v: 2100, label: '2.1k' },
    { v: 5000, label: '5k' },
  ];

  return (
    <Sheet onClose={close} screen="zap-modal" label={t('mobile.zap.title')}>
      <div className="zap-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-2 8 10-12h-7l2-8z" /></svg>
        {t('mobile.zap.title')}
      </div>
      <div className="zap-recipient">
        <NameAvatar pubkey={msg.pubkey} name={name} picture={meta?.picture} className="me-avatar" size={40} />
        <div>
          <div style={{ fontWeight: 700, color: 'var(--app-text)', fontSize: 14 }}>{name}</div>
          {meta?.nip05 && <div style={{ fontSize: 11, color: 'var(--accent)' }}>{meta.nip05}</div>}
        </div>
      </div>
      <div className="zap-amounts">
        {presets.map((p) => (
          <button
            key={p.v}
            className={`zap-amount ${amount === p.v ? 'active' : ''}`}
            onClick={() => setAmount(p.v)}
          >
            {p.label}
            <span className="zap-amount-sub">sats</span>
          </button>
        ))}
        <button className="zap-amount">···<span className="zap-amount-sub">custom</span></button>
      </div>
      <div className="zap-memo">&quot;{msg.content.slice(0, 80)}{msg.content.length > 80 ? '…' : ''}&quot;</div>
      <div className="zap-wallet">
        <span className="settings-status-dot ok" />
        {t('mobile.zap.walletHint')}
      </div>
      <SheetActions
        primary={{ label: t('zap.sendAmount').replace('{amount}', formatNumber(locale, amount)), onClick: close }}
        onCancel={close}
      />
    </Sheet>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 16 - settings · profile
