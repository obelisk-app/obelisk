'use client';

import { useEffect, useMemo, useState } from 'react';
import { useZapStore } from '@/store/zap';
import { useChatStore } from '@/store/chat';
import { formatPubkey, getExplicitRelays } from '@/lib/nostr';
import { useAuthStore } from '@/store/auth';
import { useLocalWallet } from '@/lib/wallet/local-client';
import { resolveLightningAddress, requestInvoice } from '@/lib/wallet/lnurl-pay';
import { getLightningAddress } from '@/lib/wallet/provisioning';
import { buildZapRequest } from '@/lib/wallet/zap-request';
import { useKEKSigner, useSigner } from '@nostr-wot/data/react';
import type { NostrSigner } from '@nostr-wot/signers';

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

  const myPubkey = useAuthStore((s) => s.profile?.pubkey ?? null);
  const kekSigner = useKEKSigner();
  const signer = useSigner() as unknown as NostrSigner | null;
  const { client: walletClient } = useLocalWallet(myPubkey, kekSigner);

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
    if (!walletClient) {
      pushEphemeral(channelId, '⚠️ Configurá tu wallet primero.');
      close();
      return;
    }
    if (target === myPubkey) {
      pushEphemeral(channelId, '⚠️ No podés zapearte a vos mismo.');
      return;
    }
    setBusy(true);
    try {
      // Resolve recipient's Lightning Address: cached member field → server profile → nostr-wot lookup.
      let lnAddress: string | null = null;
      const member = memberList.find((m) => m.pubkey === target);
      lnAddress = (member as { lightningAddress?: string } | undefined)?.lightningAddress ?? null;
      if (!lnAddress) {
        try {
          const profileRes = await fetch(`/api/profile/${target}`);
          if (profileRes.ok) {
            const p = await profileRes.json();
            lnAddress = (p?.lightningAddress ?? p?.lud16) ?? null;
          }
        } catch { /* ignore */ }
      }
      if (!lnAddress) {
        lnAddress = await getLightningAddress(target).catch(() => null);
      }
      if (!lnAddress) {
        pushEphemeral(channelId, '⚠️ Ese usuario no tiene una dirección Lightning.');
        close();
        return;
      }

      const params = await resolveLightningAddress(lnAddress);
      const amountMsat = amount * 1000;
      if (amountMsat < params.minSendable || amountMsat > params.maxSendable) {
        pushEphemeral(channelId, `⚠️ Monto fuera de rango (${Math.ceil(params.minSendable / 1000)}–${Math.floor(params.maxSendable / 1000)} sats).`);
        close();
        return;
      }

      // Build a signed NIP-57 zap-request so the recipient's LNURL provider
      // publishes a kind 9735 receipt to the recipient's relays — proof of
      // payment that doesn't need any Obelisk-server audit log.
      let zapRequest: unknown = undefined;
      try {
        if (signer) {
          const recipientRelays = getExplicitRelays();
          if (recipientRelays.length === 0) recipientRelays.push('wss://relay.damus.io', 'wss://nos.lol');
          zapRequest = await buildZapRequest(signer, {
            recipientPubkey: target,
            amountMsat,
            relays: recipientRelays,
            comment: undefined,
          });
        }
      } catch { /* signer unavailable — fall back to plain LNURL-pay */ }

      const { invoice } = await requestInvoice(params.callback, amountMsat, 'Zap en Obelisk', zapRequest);

      // Pay via local NWC.
      await (walletClient as unknown as { payInvoice: (a: { invoice: string }) => Promise<unknown> })
        .payInvoice({ invoice });

      // Visible chat message — same copy as before plus the powered-by tag.
      const name = member?.displayName || formatPubkey(target);
      const content = `⚡ zapeé a @${name} ${amount} sats — Powered by nostr-wot`;
      await fetch(`/api/channels/${channelId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).catch(() => {});
      close();
    } catch (err) {
      pushEphemeral(channelId, `⚠️ Fallo el zap (${(err as Error).message}).`);
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
