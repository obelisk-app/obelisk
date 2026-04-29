'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useLocalWallet } from '@/lib/wallet/local-client';
import { hasLocalWallet, saveLocalWallet } from '@/lib/wallet/local-store';
import {
  provisionWallet,
  claimLightningAddress,
  getLightningAddress,
  releaseLightningAddress,
} from '@/lib/wallet/provisioning';
import { lnbitsToNwc } from '@/lib/wallet/lnbits-to-nwc';
import { PoweredByNostrWot } from './PoweredByNostrWot';
import { getSigner } from '@/lib/nostr';
import { useKEKSigner } from '@nostr-wot/data/react';

type Tab = 'quick' | 'nwc' | 'lnbits';
type View = 'main' | 'send' | 'receive';

export default function WalletPanel() {
  const profile = useAuthStore((s) => s.profile);
  const pubkey = profile?.pubkey ?? null;

  const signer = useKEKSigner();

  const { client, reload, disconnect } = useLocalWallet(pubkey, signer);

  const [tab, setTab] = useState<Tab>('quick');
  const [busy, setBusy] = useState<boolean>(false);
  const [view, setView] = useState<View>('main');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // NWC paste form
  const [nwcUrl, setNwcUrl] = useState<string>('');
  const [label, setLabel] = useState<string>('');

  // LNbits form
  const [lnbitsUrl, setLnbitsUrl] = useState<string>('');
  const [lnbitsKey, setLnbitsKey] = useState<string>('');

  // Connected view
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(false);
  const [lnAddress, setLnAddress] = useState<string | null>(null);
  const [claimUsername, setClaimUsername] = useState<string>('');

  // Send / receive
  const [sendInvoice, setSendInvoice] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [receiveAmount, setReceiveAmount] = useState<string>('');
  const [receiveDesc, setReceiveDesc] = useState<string>('');
  const [generatedInvoice, setGeneratedInvoice] = useState<string | null>(null);
  const { copy: copyToClipboard } = useCopyToClipboard();

  // ─── Auto-migration on mount ────────────────────────────────────────
  useEffect(() => {
    if (!pubkey || !signer) return;
    if (hasLocalWallet(pubkey)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/wallet/legacy-export');
        if (cancelled) return;
        if (!res.ok) return;
        const body = await res.json();
        if (body?.nwcUri) {
          await saveLocalWallet(pubkey, signer, {
            source: 'nwc',
            nwcUri: body.nwcUri,
            label: body.label ?? 'Migrated',
          });
          await reload();
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [pubkey, signer, reload]);

  // ─── Balance polling when connected ─────────────────────────────────
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    setBalanceLoading(true);
    (async () => {
      try {
        const r = await (client as any).getBalance();
        if (!cancelled) setBalance(Math.floor(((r as { balance?: number }).balance ?? 0) / 1000));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client]);

  // ─── LN address lookup when connected ───────────────────────────────
  useEffect(() => {
    if (!pubkey || !client) return;
    let cancelled = false;
    (async () => {
      const addr = await getLightningAddress(pubkey).catch(() => null);
      if (!cancelled) setLnAddress(addr);
    })();
    return () => { cancelled = true; };
  }, [pubkey, client]);

  const handleQuickSetup = useCallback(async () => {
    const nip98Signer = getSigner();
    if (!nip98Signer || !signer || !pubkey) return;
    setBusy(true); setStatus(null); setError(null);
    try {
      const { nwcUri } = await provisionWallet(nip98Signer);
      await saveLocalWallet(pubkey, signer, { source: 'quick', nwcUri, label: 'nostr-wot' });
      await reload();
      setStatus('Wallet conectada');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [pubkey, signer, reload]);

  const handleNwcConnect = useCallback(async () => {
    if (!signer || !pubkey) return;
    if (!nwcUrl.trim().startsWith('nostr+walletconnect://')) {
      setError('Esa URL no parece un Nostr Wallet Connect URI');
      return;
    }
    setBusy(true); setStatus(null); setError(null);
    try {
      await saveLocalWallet(pubkey, signer, {
        source: 'nwc',
        nwcUri: nwcUrl.trim(),
        label: label.trim() || undefined,
      });
      await reload();
      setNwcUrl(''); setLabel('');
      setStatus('Wallet conectada');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [pubkey, signer, nwcUrl, label, reload]);

  const handleLnbitsConnect = useCallback(async () => {
    if (!signer || !pubkey) return;
    setBusy(true); setStatus(null); setError(null);
    try {
      const { nwcUri } = await lnbitsToNwc(lnbitsUrl, lnbitsKey);
      await saveLocalWallet(pubkey, signer, {
        source: 'lnbits',
        nwcUri,
        lnbitsInstance: lnbitsUrl.trim().replace(/\/+$/, ''),
        label: 'LNbits',
      });
      await reload();
      setLnbitsUrl(''); setLnbitsKey('');
      setStatus('Wallet conectada');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [pubkey, signer, lnbitsUrl, lnbitsKey, reload]);

  const handleDisconnect = useCallback(async () => {
    if (!confirm('¿Desconectar la wallet?')) return;
    await disconnect();
    setBalance(null); setLnAddress(null); setView('main');
  }, [disconnect]);

  const handleClaimAddress = useCallback(async () => {
    const nip98Signer = getSigner();
    if (!nip98Signer || !claimUsername.trim()) return;
    setBusy(true); setError(null);
    try {
      const { address } = await claimLightningAddress(nip98Signer, claimUsername.trim());
      setLnAddress(address);
      setClaimUsername('');
      setStatus(`Reclamaste ${address}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [claimUsername]);

  const handleReleaseAddress = useCallback(async () => {
    const nip98Signer = getSigner();
    if (!nip98Signer) return;
    if (!confirm('¿Liberar tu Lightning Address?')) return;
    setBusy(true); setError(null);
    try {
      await releaseLightningAddress(nip98Signer);
      setLnAddress(null);
      setStatus('Dirección liberada');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, []);

  const handleSend = useCallback(async () => {
    if (!client || !sendInvoice.trim()) return;
    setSending(true); setError(null);
    try {
      await (client as any).payInvoice({ invoice: sendInvoice.trim() });
      setSendInvoice('');
      setStatus('Pago enviado');
      const b = await (client as any).getBalance();
      setBalance(Math.floor(((b as { balance?: number }).balance ?? 0) / 1000));
      setView('main');
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  }, [client, sendInvoice]);

  const handleReceive = useCallback(async () => {
    if (!client) return;
    const amt = Number(receiveAmount);
    if (!amt || amt <= 0) return;
    setBusy(true); setError(null);
    try {
      const inv = await (client as any).makeInvoice({ amount: amt * 1000, description: receiveDesc || undefined });
      setGeneratedInvoice((inv as { invoice?: string }).invoice ?? null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [client, receiveAmount, receiveDesc]);

  if (!pubkey) {
    return <div className="lc-card p-4 text-sm text-lc-muted">Iniciá sesión para usar la wallet</div>;
  }

  if (!client) {
    return (
      <section className="lc-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-lc-white">⚡ Conectar wallet</h2>
        </div>
        <div className="flex gap-2 mb-4 border-b border-lc-border">
          {(['quick', 'nwc', 'lnbits'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); setStatus(null); }}
              className={`px-3 py-1.5 text-xs ${tab === t ? 'text-lc-green border-b-2 border-lc-green' : 'text-lc-muted hover:text-lc-white'}`}
            >
              {t === 'quick' ? 'Quick Setup' : t === 'nwc' ? 'NWC' : 'LNbits'}
            </button>
          ))}
        </div>
        {tab === 'quick' && (
          <div className="space-y-3">
            <p className="text-xs text-lc-muted">
              Crea una billetera Lightning con un click. Sin registro — se autentica con tu identidad Nostr.
            </p>
            <button onClick={handleQuickSetup} disabled={busy} className="lc-pill-primary text-xs disabled:opacity-50">
              {busy ? 'Creando...' : 'Crear billetera'}
            </button>
          </div>
        )}
        {tab === 'nwc' && (
          <div className="space-y-3">
            <input value={nwcUrl} onChange={(e) => setNwcUrl(e.target.value)} placeholder="nostr+walletconnect://..."
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Etiqueta (opcional)"
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
            <button onClick={handleNwcConnect} disabled={busy || !nwcUrl} className="lc-pill-primary text-xs disabled:opacity-50">
              {busy ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
        )}
        {tab === 'lnbits' && (
          <div className="space-y-3">
            <input value={lnbitsUrl} onChange={(e) => setLnbitsUrl(e.target.value)} placeholder="https://lnbits.example"
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
            <input type="password" value={lnbitsKey} onChange={(e) => setLnbitsKey(e.target.value)} placeholder="Admin key"
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
            <button onClick={handleLnbitsConnect} disabled={busy || !lnbitsUrl || !lnbitsKey} className="lc-pill-primary text-xs disabled:opacity-50">
              {busy ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
        )}
        {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
        {status && <div className="text-xs text-lc-muted mt-2">{status}</div>}
        <PoweredByNostrWot />
      </section>
    );
  }

  // Connected view
  return (
    <>
      <section className="lc-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-lc-white">⚡ Lightning Wallet</h2>
          <button onClick={handleDisconnect} className="text-xs text-lc-muted hover:text-red-400">Desconectar</button>
        </div>
        {view === 'main' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-lc-black border border-lc-border rounded-lg px-3 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-lc-muted">Balance</div>
                <div className="text-lc-white text-xl font-semibold">
                  {balanceLoading ? '...' : balance !== null ? `${balance.toLocaleString()} sats` : '—'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setView('send')} className="lc-pill-secondary text-xs">Enviar</button>
              <button onClick={() => { setView('receive'); setGeneratedInvoice(null); setReceiveAmount(''); setReceiveDesc(''); }} className="lc-pill-secondary text-xs">Recibir</button>
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            {status && <div className="text-xs text-lc-muted">{status}</div>}
            <PoweredByNostrWot />
          </div>
        ) : view === 'send' ? (
          <div className="space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-lc-muted hover:text-lc-white">&larr; Atrás</button>
            <input value={sendInvoice} onChange={(e) => setSendInvoice(e.target.value)} placeholder="lnbc..."
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white font-mono outline-none focus:border-lc-green" />
            <button onClick={handleSend} disabled={sending || !sendInvoice} className="lc-pill-primary text-xs disabled:opacity-50">
              {sending ? 'Pagando...' : 'Pagar'}
            </button>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <PoweredByNostrWot />
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={() => setView('main')} className="text-xs text-lc-muted hover:text-lc-white">&larr; Atrás</button>
            {generatedInvoice ? (
              <>
                <div className="bg-lc-black border border-lc-border rounded-lg p-3 text-xs font-mono text-lc-white break-all">
                  {generatedInvoice}
                </div>
                <button onClick={() => copyToClipboard(generatedInvoice)} className="lc-pill-secondary text-xs">Copiar</button>
              </>
            ) : (
              <>
                <input value={receiveAmount} onChange={(e) => setReceiveAmount(e.target.value)} placeholder="Monto en sats" type="number"
                  className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
                <input value={receiveDesc} onChange={(e) => setReceiveDesc(e.target.value)} placeholder="Descripción (opcional)"
                  className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
                <button onClick={handleReceive} disabled={busy || !receiveAmount} className="lc-pill-primary text-xs disabled:opacity-50">
                  {busy ? 'Generando...' : 'Generar invoice'}
                </button>
              </>
            )}
            {error && <div className="text-xs text-red-400">{error}</div>}
            <PoweredByNostrWot />
          </div>
        )}
      </section>

      <section className="lc-card p-4 mt-3">
        <h3 className="text-sm font-semibold text-lc-white mb-2">⚡ Dirección Lightning</h3>
        {lnAddress ? (
          <div className="flex items-center justify-between bg-lc-black border border-lc-border rounded-lg px-3 py-2">
            <span className="text-sm text-lc-white font-mono">{lnAddress}</span>
            <button onClick={handleReleaseAddress} disabled={busy} className="text-xs text-lc-muted hover:text-red-400">Cambiar</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-lc-muted">Reclamá una dirección Lightning como `tu-nombre@zaps.nostr-wot.com`.</p>
            <div className="flex gap-2">
              <input value={claimUsername} onChange={(e) => setClaimUsername(e.target.value)} placeholder="usuario"
                className="flex-1 bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green" />
              <button onClick={handleClaimAddress} disabled={busy || !claimUsername} className="lc-pill-primary text-xs disabled:opacity-50">
                {busy ? '...' : 'Reclamar'}
              </button>
            </div>
          </div>
        )}
        <PoweredByNostrWot />
      </section>
    </>
  );
}
