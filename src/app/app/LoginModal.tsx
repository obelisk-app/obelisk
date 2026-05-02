'use client';

/**
 * Visual port of obelisk's LoginModal.tsx — same JSX/CSS verbatim, swapped
 * to use bridge actions instead of obelisk's NDK + backend-auth path.
 *
 * Differences from obelisk:
 *   • No backend challenge-response (we don't have a backend).
 *   • No ProfileEditor screen (next iteration).
 *   • Bunker tab shows "coming soon" (NIP-46 not yet implemented in TS bridge).
 *   • New-account flow generates a fresh nsec via nostr-tools.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { nostrActions, decodeNsec } from '@/lib/nostr-bridge';

type LoginMethod = 'extension' | 'nsec' | 'bunker';
type BunkerTab = 'qr' | 'url';

export default function LoginModal({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [method, setMethod] = useState<LoginMethod | null>(null);
  const [nsecInput, setNsecInput] = useState('');
  const [bunkerInput, setBunkerInput] = useState('');
  const [bunkerTab, setBunkerTab] = useState<BunkerTab>('qr');
  const [loadingMethod, setLoadingMethod] = useState<LoginMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newAccountNsec, setNewAccountNsec] = useState<string | null>(null);
  const [nsecCopied, setNsecCopied] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [connectUri, setConnectUri] = useState('');
  const [waitingForScan, setWaitingForScan] = useState(false);
  const [authChallengeUrl, setAuthChallengeUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasNip07, setHasNip07] = useState(false);
  const qrSessionRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    const check = () => setHasNip07(typeof window !== 'undefined' && !!(window as any).nostr);
    check();
    // Extensions may inject window.nostr after page load.
    const id = window.setInterval(check, 500);
    const stop = window.setTimeout(() => window.clearInterval(id), 5000);
    return () => { window.clearInterval(id); window.clearTimeout(stop); };
  }, []);

  const isLoading = loadingMethod !== null || creatingAccount;

  const handleLogin = useCallback(async (loginMethod: LoginMethod) => {
    setLoadingMethod(loginMethod);
    setError(null);
    try {
      switch (loginMethod) {
        case 'extension': {
          if (!(window as any).nostr) {
            throw new Error('Nostr extension not detected. Install Alby, nos2x, nostr-wot, or similar.');
          }
          const pubkey = await (window as any).nostr.getPublicKey();
          await nostrActions.loginWithNip07(pubkey);
          break;
        }
        case 'nsec': {
          if (!nsecInput.trim()) throw new Error('Please enter your nsec');
          const { privKeyHex, pubKeyHex } = decodeNsec(nsecInput.trim());
          await nostrActions.loginWithNsec(privKeyHex, pubKeyHex);
          break;
        }
        case 'bunker': {
          if (!bunkerInput.trim()) throw new Error('Please enter your bunker URL');
          await nostrActions.loginWithBunker(bunkerInput.trim(), {
            onAuthUrl: (url) => setAuthChallengeUrl(url),
          });
          break;
        }
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoadingMethod(null);
    }
  }, [bunkerInput, nsecInput, onSuccess]);

  const handleBack = useCallback(() => {
    setMethod(null);
    setError(null);
    if (qrSessionRef.current) {
      qrSessionRef.current.cancel();
      qrSessionRef.current = null;
    }
    setConnectUri('');
    setWaitingForScan(false);
    setAuthChallengeUrl(null);
  }, []);

  // Generate a nostrconnect:// URI when the QR tab opens; await scan + connect.
  useEffect(() => {
    if (method !== 'bunker' || bunkerTab !== 'qr') return;
    let cancelled = false;
    setError(null);
    setConnectUri('');
    setWaitingForScan(true);
    setAuthChallengeUrl(null);

    (async () => {
      try {
        const session = await nostrActions.createNostrConnectSession({
          onAuthUrl: (url) => { if (!cancelled) setAuthChallengeUrl(url); },
        });
        if (cancelled) { session.cancel(); return; }
        qrSessionRef.current = { cancel: session.cancel };
        setConnectUri(session.uri);
        await session.waitForConnection();
        if (cancelled) return;
        onSuccess?.();
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'NostrConnect failed';
        if (msg !== 'NostrConnect cancelled') setError(msg);
      } finally {
        if (!cancelled) setWaitingForScan(false);
      }
    })();

    return () => {
      cancelled = true;
      if (qrSessionRef.current) {
        qrSessionRef.current.cancel();
        qrSessionRef.current = null;
      }
    };
  }, [method, bunkerTab, onSuccess]);

  const handleCopyUri = useCallback(async () => {
    if (!connectUri) return;
    try { await navigator.clipboard.writeText(connectUri); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [connectUri]);

  const handleCreateAccount = useCallback(async () => {
    setCreatingAccount(true);
    setError(null);
    try {
      const sk = generateSecretKey();
      const pk = getPublicKey(sk);
      const nsec = nip19.nsecEncode(sk);
      setNewAccountNsec(nsec);
      const skHex = Array.from(sk).map((b) => b.toString(16).padStart(2, '0')).join('');
      // Stash the keypair so the "Continue" button can log in immediately.
      sessionStorage.setItem('obelisk-dex/pending-new-account', JSON.stringify({ skHex, pkHex: pk }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setCreatingAccount(false);
    }
  }, []);

  const handleCopyNsec = useCallback(async () => {
    if (!newAccountNsec) return;
    try {
      await navigator.clipboard.writeText(newAccountNsec);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = newAccountNsec;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setNsecCopied(true);
    setTimeout(() => setNsecCopied(false), 2000);
  }, [newAccountNsec]);

  const handleDownloadNsec = useCallback(() => {
    if (!newAccountNsec) return;
    const content = `Obelisk-dex — Nostr Private Key Backup

Keep this file safe and secret. Anyone with this key controls your account. There is no recovery if you lose it.

Private Key (nsec):
${newAccountNsec}
`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'obelisk-dex-nsec-backup.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [newAccountNsec]);

  const handleContinueAfterBackup = useCallback(async () => {
    const raw = sessionStorage.getItem('obelisk-dex/pending-new-account')
      ?? sessionStorage.getItem('obeliskord/pending-new-account');
    if (!raw) return;
    try {
      const { skHex, pkHex } = JSON.parse(raw) as { skHex: string; pkHex: string };
      await nostrActions.loginWithNsec(skHex, pkHex);
      sessionStorage.removeItem('obelisk-dex/pending-new-account');
      sessionStorage.removeItem('obeliskord/pending-new-account');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }, [onSuccess]);

  return (
    <div className="lc-grid-bg fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-lc-border bg-lc-dark p-6 shadow-2xl sm:p-8">
        <div className={`mb-6 flex items-center ${newAccountNsec ? 'justify-end' : 'justify-between'}`}>
          {!newAccountNsec && (
            <div>
              <h2 className="text-xl font-bold text-lc-white">Connect to Nostr</h2>
              <p className="mt-1 text-sm text-lc-muted">Choose your login method</p>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        {newAccountNsec ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lc-green/15">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold leading-tight text-lc-white">Account Created</h3>
                <p className="text-xs text-lc-muted">
                  Save your key — it&apos;s the <span className="font-medium text-lc-white">only way</span> back in.
                </p>
              </div>
            </div>

            <div className="relative">
              <code className="block w-full select-all break-all rounded-xl border border-lc-border bg-lc-black p-3 pr-11 font-mono text-xs leading-relaxed text-lc-white">
                {newAccountNsec}
              </code>
              <button
                onClick={handleCopyNsec}
                className="absolute right-2 top-2 rounded-lg bg-lc-border/80 p-1.5 transition hover:bg-lc-border"
                title="Copy to clipboard"
              >
                {nsecCopied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            </div>

            <p className="flex items-start gap-1.5 text-xs text-red-400/80">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-0.5 flex-shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Lose this key and your account is gone. No recovery.
            </p>

            <button onClick={handleDownloadNsec} className="lc-pill lc-pill-secondary flex w-full items-center justify-center gap-2 text-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download backup (.txt)
            </button>

            <label className="flex cursor-pointer select-none items-start gap-3 rounded-xl border border-lc-border bg-lc-black/40 p-3">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-lc-green"
              />
              <span className="text-xs leading-relaxed text-lc-muted">
                I&apos;ve backed up my key and understand losing it means losing my account.
              </span>
            </label>

            <button
              onClick={handleContinueAfterBackup}
              disabled={!backupConfirmed}
              className="lc-pill lc-pill-primary flex w-full items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
          </div>

        ) : !method ? (
          <div className="space-y-3">
            {hasNip07 && (
              <button
                onClick={() => handleLogin('extension')}
                disabled={isLoading}
                className="group flex w-full items-center gap-4 rounded-xl border border-lc-green/20 bg-lc-olive/40 p-4 transition-all duration-200 hover:bg-lc-olive/60 disabled:opacity-50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lc-green/20 transition group-hover:bg-lc-green/30">
                  {loadingMethod === 'extension' ? (
                    <div className="lc-spinner" style={{ width: 22, height: 22, borderWidth: '2px' }} />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-lc-white">Browser Extension</div>
                  <div className="text-sm text-lc-muted">
                    {loadingMethod === 'extension' ? 'Connecting...' : 'Alby, nos2x, nostr-wot, or similar'}
                  </div>
                </div>
              </button>
            )}

            <button
              onClick={() => setMethod('nsec')}
              disabled={isLoading}
              className="group flex w-full items-center gap-4 rounded-xl border border-lc-border bg-lc-card p-4 transition-all duration-200 hover:bg-lc-border/50 disabled:opacity-50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lc-border transition group-hover:bg-lc-border/80">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-lc-white">Private Key (nsec)</div>
                <div className="text-sm text-lc-muted">Enter your nsec directly</div>
              </div>
            </button>

            <button
              onClick={() => setMethod('bunker')}
              disabled={isLoading}
              className="group flex w-full items-center gap-4 rounded-xl border border-lc-border bg-lc-card p-4 transition-all duration-200 hover:bg-lc-border/50 disabled:opacity-50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lc-border transition group-hover:bg-lc-border/80">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-lc-white">Nostr Bunker</div>
                <div className="text-sm text-lc-muted">Remote signer (NIP-46)</div>
              </div>
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-lc-border/50" />
              <span className="text-xs text-lc-muted">or</span>
              <div className="h-px flex-1 bg-lc-border/50" />
            </div>

            <button
              onClick={handleCreateAccount}
              disabled={isLoading}
              className="group flex w-full items-center gap-4 rounded-xl border border-lc-border bg-lc-card p-4 transition-all duration-200 hover:bg-lc-border/50 disabled:opacity-50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lc-green/10 transition group-hover:bg-lc-green/20">
                {creatingAccount ? (
                  <div className="lc-spinner" style={{ width: 22, height: 22, borderWidth: '2px' }} />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
                    <path d="M19 15l.7 1.7L21.5 17.5l-1.8.8L19 20l-.7-1.7L16.5 17.5l1.8-.8z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-lc-white">Create New Account</div>
                <div className="text-sm text-lc-muted">
                  {creatingAccount ? 'Generating keys...' : 'Generate a fresh Nostr identity'}
                </div>
              </div>
            </button>
          </div>

        ) : method === 'nsec' ? (
          <div className="space-y-5">
            <button onClick={handleBack} className="flex items-center gap-1.5 rounded-lg border border-lc-border bg-lc-black/60 px-3 py-1.5 text-sm text-lc-white/80 transition hover:bg-lc-black hover:text-lc-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
            <div>
              <label className="mb-2 block text-sm font-medium text-lc-muted">Enter your nsec (private key)</label>
              <input
                type="password"
                value={nsecInput}
                onChange={(e) => setNsecInput(e.target.value)}
                placeholder="nsec1..."
                className="w-full rounded-xl border border-lc-border bg-lc-black p-3.5 font-mono text-sm text-lc-white placeholder-lc-border transition focus:border-lc-green/50 focus:outline-none focus:ring-1 focus:ring-lc-green/20"
              />
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-lc-muted">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Your private key never leaves this browser.
              </p>
            </div>
            <button
              onClick={() => handleLogin('nsec')}
              disabled={isLoading || !nsecInput.trim()}
              className="lc-pill lc-pill-primary flex w-full items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loadingMethod === 'nsec' && <div className="lc-spinner" style={{ borderColor: 'rgba(10,10,10,0.3)', borderTopColor: '#0a0a0a' }} />}
              {loadingMethod === 'nsec' ? 'Connecting...' : 'Connect'}
            </button>
          </div>

        ) : (
          <div className="space-y-5">
            <button onClick={handleBack} className="flex items-center gap-1.5 rounded-lg border border-lc-border bg-lc-black/60 px-3 py-1.5 text-sm text-lc-white/80 transition hover:bg-lc-black hover:text-lc-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>

            <div className="flex rounded-xl border border-lc-border/50 bg-lc-black p-1">
              <button
                onClick={() => setBunkerTab('qr')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${bunkerTab === 'qr' ? 'bg-lc-border text-lc-white' : 'text-lc-muted hover:text-lc-white'}`}
              >
                QR Code
              </button>
              <button
                onClick={() => setBunkerTab('url')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${bunkerTab === 'url' ? 'bg-lc-border text-lc-white' : 'text-lc-muted hover:text-lc-white'}`}
              >
                Bunker URL
              </button>
            </div>

            {bunkerTab === 'qr' ? (
              <div className="space-y-4">
                {authChallengeUrl ? (
                  <div className="rounded-xl border border-lc-green/30 bg-lc-green/5 p-4 text-center">
                    <p className="mb-3 text-sm text-lc-white">Your signer needs you to approve this login.</p>
                    <a
                      href={authChallengeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="lc-pill lc-pill-primary inline-flex items-center justify-center gap-2 text-sm"
                    >
                      Open signer
                    </a>
                  </div>
                ) : connectUri ? (
                  <>
                    <div className="flex items-center justify-center rounded-xl border border-lc-border/50 bg-white p-4">
                      <QRCodeSVG value={connectUri} size={224} level="M" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-center text-xs text-lc-muted">
                        Scan with your remote signer (nsec.app, Amber, etc.)
                      </p>
                      <a
                        href={connectUri}
                        target="_blank"
                        rel="noreferrer"
                        className="lc-pill lc-pill-primary flex w-full items-center justify-center gap-2 text-xs"
                      >
                        Open in signer app
                      </a>
                      <button
                        onClick={handleCopyUri}
                        className="lc-pill lc-pill-secondary flex w-full items-center justify-center gap-2 text-xs"
                      >
                        {copied ? 'Copied!' : 'Copy nostrconnect:// URI'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-lc-border/50 bg-lc-black p-6 text-center">
                    {waitingForScan ? (
                      <div className="flex items-center justify-center gap-3 text-sm text-lc-muted">
                        <div className="lc-spinner" />
                        Generating connection URI…
                      </div>
                    ) : (
                      <p className="text-sm text-lc-muted">Preparing QR code…</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-lc-muted">Paste your bunker URL</label>
                  <input
                    type="text"
                    value={bunkerInput}
                    onChange={(e) => setBunkerInput(e.target.value)}
                    placeholder="bunker://..."
                    className="w-full rounded-xl border border-lc-border bg-lc-black p-3.5 font-mono text-sm text-lc-white placeholder-lc-border transition focus:border-lc-green/50 focus:outline-none focus:ring-1 focus:ring-lc-green/20"
                  />
                  <p className="mt-2.5 text-xs text-lc-muted">Get this from your nsecBunker or similar remote signer.</p>
                </div>
                <button
                  onClick={() => handleLogin('bunker')}
                  disabled={isLoading || !bunkerInput.trim()}
                  className="lc-pill lc-pill-primary flex w-full items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loadingMethod === 'bunker' && <div className="lc-spinner" style={{ borderColor: 'rgba(10,10,10,0.3)', borderTopColor: '#0a0a0a' }} />}
                  {loadingMethod === 'bunker' ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
