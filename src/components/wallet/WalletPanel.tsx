'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

type View = 'main' | 'send' | 'receive';

interface WalletInfo {
  connected: boolean;
  label: string | null;
}

export default function WalletPanel() {
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nwcUrl, setNwcUrl] = useState('');
  const [label, setLabel] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [view, setView] = useState<View>('main');
  const [sendInvoice, setSendInvoice] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendComment, setSendComment] = useState('');
  const [sending, setSending] = useState(false);
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveDesc, setReceiveDesc] = useState('');
  const [generatedInvoice, setGeneratedInvoice] = useState<string | null>(null);
  const { copied, copy: copyToClipboard } = useCopyToClipboard();
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/wallet');
      if (r.ok) setInfo(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const r = await fetch('/api/wallet/balance');
      if (r.ok) {
        const d = await r.json();
        setBalance(d.balanceSats ?? null);
      } else {
        const d = await r.json().catch(() => ({}));
        setBalanceError(d.error || 'unreachable');
        setBalance(null);
      }
    } catch {
      setBalanceError('unreachable');
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (info?.connected) fetchBalance(); }, [info?.connected, fetchBalance]);

  const connect = async () => {
    if (!nwcUrl.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const r = await fetch('/api/wallet', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nwcUrl: nwcUrl.trim(), label: label || undefined }),
      });
      if (r.ok) {
        setNwcUrl(''); setLabel('');
        setStatus('Wallet conectada');
        await load();
      } else {
        const d = await r.json().catch(() => ({}));
        setStatus(d.error || 'No se pudo conectar');
      }
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('¿Desconectar la wallet?')) return;
    await fetch('/api/wallet', { method: 'DELETE' });
    setBalance(null); setInfo({ connected: false, label: null }); setView('main');
  };

  const send = async () => {
    const target = sendInvoice.trim();
    if (!target) return;
    const isAddress = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(target);
    const payload: Record<string, unknown> = isAddress
      ? { address: target, amountSats: parseInt(sendAmount, 10), comment: sendComment || undefined }
      : { invoice: target };
    if (isAddress && (!payload.amountSats || (payload.amountSats as number) <= 0)) {
      setStatus('Indicá un monto en sats');
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const r = await fetch('/api/wallet/pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setStatus('Pago enviado');
        setSendInvoice(''); setSendAmount(''); setSendComment('');
        setView('main');
        fetchBalance();
      } else {
        setStatus(d.error || 'Fallo el pago');
      }
    } finally {
      setSending(false);
    }
  };

  const receive = async () => {
    const amt = parseInt(receiveAmount, 10);
    if (!amt || amt <= 0) return;
    setStatus(null);
    const r = await fetch('/api/wallet/invoice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountSats: amt, description: receiveDesc || undefined }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.invoice) setGeneratedInvoice(d.invoice);
    else setStatus(d.error || 'No se pudo crear la factura');
  };

  const copy = () => {
    if (generatedInvoice) void copyToClipboard(generatedInvoice);
  };

  if (loading) return <div className="lc-card p-4"><div className="lc-spinner" /></div>;

  return (
    <section className="lc-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-lc-white">⚡ Lightning Wallet (NWC)</h2>
        {info?.connected && (
          <button onClick={disconnect} className="text-xs text-lc-muted hover:text-red-400">
            Desconectar
          </button>
        )}
      </div>

      {!info?.connected ? (
        <div className="space-y-3">
          <p className="text-xs text-lc-muted">
            Pegá tu URL de Nostr Wallet Connect (Alby, Primal, etc.) para habilitar zaps entre usuarios.
          </p>
          <input
            value={nwcUrl}
            onChange={(e) => setNwcUrl(e.target.value)}
            placeholder="nostr+walletconnect://..."
            className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Etiqueta (opcional) — ej. Alby"
            className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
          />
          <button onClick={connect} disabled={saving || !nwcUrl} className="lc-pill-primary text-xs disabled:opacity-50">
            {saving ? 'Conectando...' : 'Conectar'}
          </button>
          {status && <div className="text-xs text-lc-muted">{status}</div>}
        </div>
      ) : view === 'main' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-lc-black border border-lc-border rounded-lg px-3 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-lc-muted">Balance</div>
              <div className="text-lc-white text-xl font-semibold">
                {balanceLoading ? '...' : balance !== null ? `${balance.toLocaleString()} sats` : '—'}
              </div>
              {balanceError && <div className="text-[10px] text-red-400">{balanceError}</div>}
            </div>
            <button onClick={fetchBalance} disabled={balanceLoading} className="lc-pill-secondary text-xs">↻</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setView('send')} className="lc-pill-secondary text-xs">Enviar</button>
            <button onClick={() => { setView('receive'); setGeneratedInvoice(null); setReceiveAmount(''); setReceiveDesc(''); }} className="lc-pill-secondary text-xs">Recibir</button>
          </div>
          {info.label && <div className="text-[10px] text-lc-muted">Conectado como: {info.label}</div>}
          {status && <div className="text-xs text-lc-muted">{status}</div>}
        </div>
      ) : view === 'send' ? (
        <div className="space-y-3">
          <button onClick={() => setView('main')} className="text-xs text-lc-muted hover:text-lc-white">&larr; Atrás</button>
          <input
            value={sendInvoice}
            onChange={(e) => setSendInvoice(e.target.value)}
            placeholder="lnbc... o user@dominio.com"
            className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
          />
          {/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(sendInvoice.trim()) && (
            <>
              <input
                type="number"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                placeholder="Monto en sats"
                className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
              />
              <input
                value={sendComment}
                onChange={(e) => setSendComment(e.target.value)}
                placeholder="Comentario (opcional)"
                className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
              />
            </>
          )}
          <button onClick={send} disabled={sending || !sendInvoice.trim()} className="lc-pill-primary text-xs disabled:opacity-50">
            {sending ? 'Enviando...' : 'Pagar factura'}
          </button>
          {status && <div className="text-xs text-lc-muted">{status}</div>}
        </div>
      ) : (
        <div className="space-y-3">
          <button onClick={() => setView('main')} className="text-xs text-lc-muted hover:text-lc-white">&larr; Atrás</button>
          {generatedInvoice ? (
            <div className="space-y-2">
              <textarea
                readOnly
                value={generatedInvoice}
                rows={4}
                className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-xs text-lc-white font-mono"
              />
              <button onClick={copy} className="lc-pill-secondary text-xs">{copied ? 'Copiado' : 'Copiar factura'}</button>
              <button onClick={() => setGeneratedInvoice(null)} className="lc-pill-secondary text-xs ml-2">Nueva factura</button>
            </div>
          ) : (
            <>
              <input
                type="number"
                value={receiveAmount}
                onChange={(e) => setReceiveAmount(e.target.value)}
                placeholder="Monto en sats"
                className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
              />
              <input
                value={receiveDesc}
                onChange={(e) => setReceiveDesc(e.target.value)}
                placeholder="Descripción (opcional)"
                className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
              />
              <button onClick={receive} disabled={!receiveAmount} className="lc-pill-primary text-xs disabled:opacity-50">
                Generar factura
              </button>
            </>
          )}
          {status && <div className="text-xs text-lc-muted">{status}</div>}
        </div>
      )}
    </section>
  );
}
