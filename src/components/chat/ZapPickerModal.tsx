'use client';

import { useEffect, useMemo, useState } from 'react';
import { useZapStore } from '@/store/zap';
import { useChatStore } from '@/store/chat';
import { formatPubkey } from '@/lib/nostr';

const QUICK_AMOUNTS = [21, 100, 500, 1000, 5000, 21000];

export default function ZapPickerModal() {
  const pickerOpen = useZapStore((s) => s.pickerOpen);
  const setPickerOpen = useZapStore((s) => s.setPickerOpen);
  const memberList = useChatStore((s) => s.memberList);
  const pushEphemeral = useChatStore((s) => s.pushEphemeral);
  const addMessage = useChatStore((s) => s.addMessage);

  const [target, setTarget] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(100);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pickerOpen) return;
    setTarget(pickerOpen.target ?? null);
    setAmount(pickerOpen.amountSats ?? 100);
    setQuery('');
  }, [pickerOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memberList
      .filter((m) => !m.isBot)
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.pubkey.includes(q))
      .slice(0, 20);
  }, [memberList, query]);

  if (!pickerOpen) return null;
  const channelId = pickerOpen.channelId;

  const close = () => setPickerOpen(null);

  const send = async () => {
    if (!target || !amount || amount <= 0) return;
    setBusy(true);
    try {
      const invRes = await fetch('/api/wallet/invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPubkey: target, amountSats: amount, description: `Zap en Obelisk` }),
      });
      if (!invRes.ok) {
        const d = await invRes.json().catch(() => ({}));
        const msg = d.error === 'target_no_wallet'
          ? `⚠️ Ese usuario no tiene NWC configurado.`
          : `⚠️ No se pudo crear la factura (${d.error || invRes.status}).`;
        pushEphemeral(channelId, msg);
        close();
        return;
      }
      const { invoice } = await invRes.json();
      const payRes = await fetch('/api/wallet/pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice }),
      });
      if (!payRes.ok) {
        const d = await payRes.json().catch(() => ({}));
        const msg = d.error === 'no_wallet'
          ? `⚠️ Configurá tu NWC en tu perfil para poder enviar zaps.`
          : d.error === 'insufficient_funds'
          ? `⚠️ No tenés suficiente balance para zappar ${amount} sats.`
          : `⚠️ Fallo el pago (${d.error || payRes.status}).`;
        pushEphemeral(channelId, msg);
        close();
        return;
      }
      // Post a visible channel message so everyone sees the zap.
      const member = memberList.find((m) => m.pubkey === target);
      const name = member?.displayName || formatPubkey(target);
      const content = `⚡ zapeé a @${name} ${amount} sats`;
      await fetch(`/api/channels/${channelId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).catch(() => {});
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={close}>
      <div className="bg-lc-dark border border-lc-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lc-white font-semibold mb-3">⚡ Enviar zap</h3>
        {!target ? (
          <>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuario..."
              className="w-full mb-3 bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
            />
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filtered.length === 0 && <div className="text-xs text-lc-muted py-2">Sin resultados.</div>}
              {filtered.map((m) => (
                <button
                  key={m.pubkey}
                  onClick={() => setTarget(m.pubkey)}
                  className="w-full text-left p-2 rounded-lg hover:bg-lc-border/40 flex items-center gap-2"
                >
                  {m.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.picture} alt="" className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-lc-border" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-lc-white truncate">{m.displayName}</div>
                    <div className="text-[10px] text-lc-muted truncate">{formatPubkey(m.pubkey)}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={close} className="lc-pill-secondary text-xs">Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 text-xs text-lc-muted">
              Destinatario: <span className="text-lc-white">{memberList.find((m) => m.pubkey === target)?.displayName || formatPubkey(target)}</span>
            </div>
            <div className="text-xs text-lc-muted mb-2">Monto (sats)</div>
            <input
              type="number"
              value={amount}
              min={1}
              onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
              className="w-full mb-3 bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
            />
            <div className="flex flex-wrap gap-2 mb-4">
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAmount(a)}
                  className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                    amount === a ? 'bg-lc-green text-lc-black border-lc-green' : 'border-lc-border text-lc-white hover:bg-lc-border/40'
                  }`}
                >{a.toLocaleString()}</button>
              ))}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setTarget(null)} className="lc-pill-secondary text-xs">Atrás</button>
              <button onClick={send} disabled={busy || !amount} className="lc-pill-primary text-xs disabled:opacity-50">
                {busy ? 'Enviando...' : `Zappar ${amount} sats`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
