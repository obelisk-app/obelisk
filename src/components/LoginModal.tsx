'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '@/store/auth';
import {
  connectNDK,
  getNDK,
  loginWithExtension,
  loginWithNsec,
  loginWithBunker,
  createNewAccount,
  createNostrConnectSession,
  LoginMethod,
  NostrConnectSession,
  logStatus,
} from '@/lib/nostr';
import { withTimeout } from '@/lib/promise';
import { performBackendAuth } from '@/lib/backend-auth';
import ProfileEditor from '@/components/ProfileEditor';

const AUTH_IN_PROGRESS_KEY = 'obelisk-auth-in-progress';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /**
   * When true, the modal is rendered without its dark/blurred backdrop so the
   * underlying page background (e.g. matrix grid + shooting stars) shows
   * through. Used on /chat when the session is invalid.
   */
  transparentBackdrop?: boolean;
}

type BunkerTab = 'qr' | 'url';

export default function LoginModal({ isOpen, onClose, onSuccess, transparentBackdrop = false }: LoginModalProps) {
  const [method, setMethod] = useState<LoginMethod | null>(null);
  const [nsecInput, setNsecInput] = useState('');
  const [bunkerInput, setBunkerInput] = useState('');
  const [hasNip07, setHasNip07] = useState(false);
  const [bunkerTab, setBunkerTab] = useState<BunkerTab>('qr');
  const [connectUri, setConnectUri] = useState('');
  const [waitingForScan, setWaitingForScan] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingMethod, setLoadingMethod] = useState<LoginMethod | null>(null);
  const [newAccountNsec, setNewAccountNsec] = useState<string | null>(null);
  const [nsecCopied, setNsecCopied] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [authChallengeUrl, setAuthChallengeUrl] = useState<string | null>(null);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [rpcEventDetected, setRpcEventDetected] = useState(false);
  const sessionRef = useRef<NostrConnectSession | null>(null);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const { setLoading, setError } = useAuthStore();

  useEffect(() => {
    if (!isOpen) return;
    const check = () => setHasNip07(!!window.nostr);
    check();
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Auto-resume NostrConnect flow if it was in progress before a reload
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      const inProgress = localStorage.getItem(AUTH_IN_PROGRESS_KEY);
      if (inProgress === 'true' && !method && isOpen) {
        console.log('[LoginModal] Resuming auth flow');
        setMethod('bunker');
        setBunkerTab('qr');
      }
    }
  }, [isOpen, method]);

  // Generate nostrconnect URI when bunker tab is selected
  useEffect(() => {
    if (method !== 'bunker' || bunkerTab !== 'qr') return;
    if (connectUri) return; // already generated

    let cancelled = false;

    const generate = async () => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AUTH_IN_PROGRESS_KEY, 'true');
        }
        const session = await createNostrConnectSession(undefined, {
          onAuthUrl: (url) => {
            console.log('[LoginModal] Received authUrl:', url);
            setAuthChallengeUrl(url);
          }
        });
        if (cancelled) {
          console.log('[LoginModal] Generation cancelled');
          session.cancel();
          return;
        }
        sessionRef.current = session;
        setConnectUri(session.uri);
        console.log('[LoginModal] connectUri set:', session.uri);
        setWaitingForScan(true);
        setShowSlowHint(false);

        const slowTimer = setTimeout(() => setShowSlowHint(true), 10000);

        // Wait for the remote signer to connect
        console.log('[LoginModal] Awaiting session.waitForConnection()...');
        logStatus('LoginModal', 'Awaiting QR scan/connection...');
        const user = await session.waitForConnection();
        clearTimeout(slowTimer);
        setShowSlowHint(false);
        console.log('[LoginModal] waitForConnection returned:', user?.pubkey);
        if (cancelled || !user) {
          logStatus('LoginModal', 'Connection cancelled or no user returned');
          return;
        }

        // Backend auth BEFORE showing as connected
        await withTimeout(performBackendAuth({ ndk: getNDK(), loginMethod: 'bunker' }), 60000, 'Backend auth timed out after 60s');

        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(AUTH_IN_PROGRESS_KEY);
        }
        setRpcEventDetected(false);
        if (onSuccess) onSuccess();
        else onClose();
      } catch (err) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(AUTH_IN_PROGRESS_KEY);
        }
        if (!cancelled) {
          console.error('NostrConnect error:', err);
          setError(err instanceof Error ? err.message : 'Connection failed');
          setWaitingForScan(false);
        }
      }
    };

    generate();

    return () => {
      cancelled = true;
      sessionRef.current?.cancel();
    };
  }, [method, bunkerTab]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setMethod(null);
      setConnectUri('');
      setWaitingForScan(false);
      setCopied(false);
      setNewAccountNsec(null);
      setNsecCopied(false);
      setCreatingAccount(false);
      setBackupConfirmed(false);
      sessionRef.current?.cancel();
      sessionRef.current = null;
      setAuthChallengeUrl(null);
      setRpcEventDetected(false);
    }
  }, [isOpen]);

  const handleCopyUri = useCallback(async () => {
    if (!connectUri) return;
    try {
      await navigator.clipboard.writeText(connectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = connectUri;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [connectUri]);

  if (!isOpen) return null;

  const handleLogin = async (loginMethod: LoginMethod) => {
    setLoading(true);
    setLoadingMethod(loginMethod);
    setError(null);

    try {
      // Start relay connections in background — never block login on relay connectivity
      connectNDK().catch(() => {});

      let user = null;

      switch (loginMethod) {
        case 'extension':
          if (!window.nostr) {
            throw new Error('Nostr extension not detected. Make sure nostr-wot, Amber, nos2x, or a similar extension is installed and tap the extension icon.');
          }
          user = await loginWithExtension();
          break;
        case 'nsec':
          if (!nsecInput.trim()) {
            throw new Error('Please enter your nsec');
          }
          user = await loginWithNsec(nsecInput);
          break;
        case 'bunker':
          if (!bunkerInput.trim()) {
            throw new Error('Please enter your bunker URL');
          }
          logStatus('BunkerLogin', 'Connecting to bunker URL...', { url: bunkerInput });
          user = await loginWithBunker(bunkerInput, {
            onAuthUrl: (url) => {
              logStatus('BunkerLogin', 'Received authUrl', { url });
              setAuthChallengeUrl(url);
            }
          });
          logStatus('BunkerLogin', 'Handshake SUCCESS', { pubkey: user?.pubkey });
          break;
      }

      if (user) {
        // Backend challenge-response auth BEFORE showing connected
        await withTimeout(performBackendAuth({ ndk: getNDK(), loginMethod }), 60000, 'Backend auth timed out after 60s');
        if (onSuccess) onSuccess();
        else onClose();
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
      setLoadingMethod(null);
    }
  };

  const handleBack = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_IN_PROGRESS_KEY);
    }
    setMethod(null);
    setConnectUri('');
    setWaitingForScan(false);
    setCopied(false);
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setAuthChallengeUrl(null);
    setRpcEventDetected(false);
    setError(null);
  };

  const handleCreateAccount = async () => {
    setCreatingAccount(true);
    setError(null);
    try {
      connectNDK().catch(() => {});
      const { nsec } = await createNewAccount();
      // performBackendAuth calls syncProfile in the background; harmless on a brand-new account
      await withTimeout(performBackendAuth({ ndk: getNDK(), loginMethod: 'nsec' }), 60000, 'Backend auth timed out after 60s');
      setNewAccountNsec(nsec);
    } catch (err) {
      console.error('Account creation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleCopyNsec = async () => {
    if (!newAccountNsec) return;
    try {
      await navigator.clipboard.writeText(newAccountNsec);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = newAccountNsec;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setNsecCopied(true);
    setTimeout(() => setNsecCopied(false), 2000);
  };

  const handleDownloadNsec = () => {
    if (!newAccountNsec) return;
    const content = `Obelisk — Nostr Private Key Backup

Keep this file safe and secret. Anyone with this key controls your account. There is no recovery if you lose it.

Private Key (nsec):
${newAccountNsec}
`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'obelisk-nsec-backup.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`fixed inset-0 flex items-center justify-center z-50 p-4 ${transparentBackdrop ? '' : 'bg-black/70 backdrop-blur-sm'}`}>
      <div className="bg-lc-dark rounded-2xl max-w-md w-full p-8 border border-lc-border shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-xl font-bold text-lc-white">Connect to Nostr</h2>
            <p className="text-sm text-lc-muted mt-1">Choose your login method</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-lc-border/50 hover:bg-lc-border text-lc-muted hover:text-lc-white transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            {error}
          </div>
        )}

        {/* Screens */}
        {showProfileSetup ? (
          <ProfileEditor
            mode="setup"
            onComplete={() => { if (onSuccess) onSuccess(); else onClose(); }}
            onSkip={() => { if (onSuccess) onSuccess(); else onClose(); }}
          />

        ) : newAccountNsec ? (
          <div className="space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 bg-lc-green/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-lc-white mb-1">Account Created</h3>
              <p className="text-sm text-lc-muted">
                Save your private key below. This is the <span className="text-lc-white font-medium">only way</span> to access your account.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-lc-muted font-medium uppercase tracking-wide">Your Private Key (nsec)</label>
              <div className="relative">
                <code className="block w-full p-3.5 bg-lc-black border border-lc-border rounded-xl text-lc-white font-mono text-xs break-all select-all leading-relaxed">
                  {newAccountNsec}
                </code>
                <button
                  onClick={handleCopyNsec}
                  className="absolute top-2.5 right-2.5 p-1.5 bg-lc-border/80 hover:bg-lc-border rounded-lg transition"
                  title="Copy to clipboard"
                >
                  {nsecCopied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-xs text-red-400/80 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                If you lose this key, you lose your account. There is no recovery.
              </p>
            </div>

            {/* nostr-wot recommendation */}
            <div className="p-4 bg-lc-olive/20 border border-lc-green/10 rounded-xl space-y-3">
              <p className="text-sm text-lc-muted">
                For the best experience using the nostr ecosystem, use the <span className="text-lc-white font-medium">nostr-wot</span> browser extension to manage your keys securely.
              </p>
              <div className="flex flex-col gap-2">
                <a
                  href="https://chromewebstore.google.com/detail/nostr-wot/gfmefgdkmjpjinecjchlangpamhclhdo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-lc-green hover:text-lc-green/80 transition"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Chrome Web Store
                </a>
                <a
                  href="https://nostr-wot.com/downloads"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-lc-muted hover:text-lc-white transition"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  nostr-wot.com/downloads
                </a>
              </div>
            </div>

            <button
              onClick={handleDownloadNsec}
              className="w-full lc-pill lc-pill-secondary text-sm flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download backup (.txt)
            </button>

            <label className="flex items-start gap-3 p-3 bg-lc-black/40 border border-lc-border rounded-xl cursor-pointer select-none">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-lc-green flex-shrink-0 cursor-pointer"
              />
              <span className="text-xs text-lc-muted leading-relaxed">
                I have securely backed up my private key (nsec) and understand that if I lose it, I lose access to my account forever.
              </span>
            </label>

            <button
              onClick={() => setShowProfileSetup(true)}
              disabled={!backupConfirmed}
              className="w-full lc-pill lc-pill-primary text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              I&apos;ve saved my key — Continue
            </button>
          </div>

        ) : !method ? (
          <div className="space-y-3">
            {/* Extension - only shown when NIP-07 is detected */}
            {hasNip07 && (
              <button
                onClick={() => handleLogin('extension')}
                disabled={isLoading}
                className="w-full flex items-center gap-4 p-4 bg-lc-olive/40 hover:bg-lc-olive/60 border border-lc-green/20 rounded-xl transition-all duration-200 disabled:opacity-50 group"
              >
                <div className="w-11 h-11 bg-lc-green/20 rounded-xl flex items-center justify-center group-hover:bg-lc-green/30 transition">
                  {loadingMethod === 'extension' ? (
                    <div className="lc-spinner" style={{ width: 22, height: 22, borderWidth: '2px' }} />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                  )}
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-lc-white">Browser Extension</div>
                  <div className="text-sm text-lc-muted">
                    {loadingMethod === 'extension' ? 'Connecting...' : 'nostr-wot, Amber, nos2x, or similar'}
                  </div>
                </div>
                {loadingMethod !== 'extension' && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" className="opacity-0 group-hover:opacity-100 transition">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                )}
              </button>
            )}

            {/* nsec */}
            <button
              onClick={() => setMethod('nsec')}
              disabled={isLoading}
              className="w-full flex items-center gap-4 p-4 bg-lc-card hover:bg-lc-border/50 border border-lc-border rounded-xl transition-all duration-200 disabled:opacity-50 group"
            >
              <div className="w-11 h-11 bg-lc-border rounded-xl flex items-center justify-center group-hover:bg-lc-border/80 transition">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-lc-white">Private Key (nsec)</div>
                <div className="text-sm text-lc-muted">Enter your nsec directly</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" className="opacity-0 group-hover:opacity-100 transition">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            {/* Bunker */}
            <button
              onClick={() => setMethod('bunker')}
              disabled={isLoading}
              className="w-full flex items-center gap-4 p-4 bg-lc-card hover:bg-lc-border/50 border border-lc-border rounded-xl transition-all duration-200 disabled:opacity-50 group"
            >
              <div className="w-11 h-11 bg-lc-border rounded-xl flex items-center justify-center group-hover:bg-lc-border/80 transition">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-lc-white">Nostr Bunker</div>
                <div className="text-sm text-lc-muted">Remote signer (NIP-46)</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" className="opacity-0 group-hover:opacity-100 transition">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-lc-border/50" />
              <span className="text-xs text-lc-muted">or</span>
              <div className="flex-1 h-px bg-lc-border/50" />
            </div>

            {/* Create New Account */}
            <button
              onClick={handleCreateAccount}
              disabled={isLoading || creatingAccount}
              className="w-full flex items-center gap-4 p-4 bg-lc-card hover:bg-lc-border/50 border border-lc-border rounded-xl transition-all duration-200 disabled:opacity-50 group"
            >
              <div className="w-11 h-11 bg-lc-green/10 rounded-xl flex items-center justify-center group-hover:bg-lc-green/20 transition">
                {creatingAccount ? (<div className="lc-spinner" style={{ width: 22, height: 22, borderWidth: "2px" }}/>

                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <line x1="20" y1="8" x2="20" y2="14"/>
                    <line x1="23" y1="11" x2="17" y2="11"/>
                  </svg>
                )}
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-lc-white">Create New Account</div>
                <div className="text-sm text-lc-muted">
                  {creatingAccount ? 'Generating keys...' : 'Generate a fresh Nostr identity'}
                </div>
              </div>
              {!creatingAccount && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" className="opacity-0 group-hover:opacity-100 transition">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </button>
          </div>

        // nsec screen
        ) : method === 'nsec' ? (
          <div className="space-y-5">
            <button onClick={handleBack} className="text-lc-muted hover:text-lc-white text-sm flex items-center gap-1.5 transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </button>
            <div>
              <label className="block text-sm text-lc-muted mb-2 font-medium">
                Enter your nsec (private key)
              </label>
              <input
                type="password"
                value={nsecInput}
                onChange={(e) => setNsecInput(e.target.value)}
                placeholder="nsec1..."
                className="w-full p-3.5 bg-lc-black border border-lc-border rounded-xl text-lc-white placeholder-lc-border font-mono text-sm focus:outline-none focus:border-lc-green/50 focus:ring-1 focus:ring-lc-green/20 transition"
              />
              <p className="mt-2.5 text-xs text-lc-muted flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Never share your nsec. It will be stored in memory only.
              </p>
            </div>
            <button
              onClick={() => handleLogin('nsec')}
              disabled={isLoading || !nsecInput.trim()}
              className="w-full lc-pill lc-pill-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loadingMethod === 'nsec' && <div className="lc-spinner" style={{ borderColor: 'rgba(10,10,10,0.3)', borderTopColor: '#0a0a0a' }} />}
              {loadingMethod === 'nsec' ? 'Connecting...' : 'Connect'}
            </button>
          </div>

        // Bunker screen with QR + URL tabs
        ) : (
          <div className="space-y-5">
            <button onClick={handleBack} className="text-lc-muted hover:text-lc-white text-sm flex items-center gap-1.5 transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </button>

            {authChallengeUrl && (
              <a
                href={authChallengeUrl}
                target={authChallengeUrl.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer"
                onClick={() => {
                  logStatus('LoginModal', 'User clicked auth challenge link', { url: authChallengeUrl });
                  setAuthChallengeUrl(null);
                }}
                className="block p-4 rounded-xl border border-lc-green/60 bg-lc-green/15 text-lc-green text-sm font-bold text-center hover:bg-lc-green/25 transition-all animate-pulse shadow-[0_0_15px_rgba(180,249,83,0.3)]"
              >
                <div className="flex items-center justify-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  ACTION REQUIRED: Approve in Signer App
                </div>
              </a>
            )}

            {/* Bunker tabs */}
            <div className="flex bg-lc-black rounded-xl p-1 border border-lc-border/50">
              <button
                onClick={() => setBunkerTab('qr')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  bunkerTab === 'qr'
                    ? 'bg-lc-border text-lc-white'
                    : 'text-lc-muted hover:text-lc-white'
                }`}
              >
                QR Code
              </button>
              <button
                onClick={() => setBunkerTab('url')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  bunkerTab === 'url'
                    ? 'bg-lc-border text-lc-white'
                    : 'text-lc-muted hover:text-lc-white'
                }`}
              >
                Bunker URL
              </button>
            </div>

            {bunkerTab === 'qr' ? (
              <div className="space-y-4">
                {/* QR Code */}
                <div className="flex flex-col items-center">
                  {connectUri ? (
                    <>
                      <div className="bg-white p-4 rounded-2xl mb-4">
                        <QRCodeSVG
                          value={connectUri}
                          size={200}
                          level="M"
                          bgColor="#ffffff"
                          fgColor="#0a0a0a"
                        />
                      </div>
                      <p className="text-sm text-lc-muted text-center mb-3">
                        Scan with your signer app (Amber, nsec.app, etc.)
                      </p>

                      {/* Copy URI button */}
                      <div className="flex flex-col gap-3 w-full max-w-[200px]">
                        <button
                          onClick={handleCopyUri}
                          className="flex items-center justify-center gap-2 text-xs text-lc-muted hover:text-lc-green transition px-3 py-2 bg-lc-black rounded-xl border border-lc-border/50"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                          </svg>
                          {copied ? 'Copied!' : 'Copy URI'}
                        </button>
                        
                        <a
                          href={connectUri}
                          onClick={(e) => {
                            e.preventDefault();
                            window.location.href = connectUri;
                          }}
                          className="flex items-center justify-center gap-2 text-xs text-lc-white hover:bg-lc-green/20 transition px-3 py-2 bg-lc-green/10 rounded-xl border border-lc-green/30"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          Open Signer App
                        </a>
                      </div>

                      {waitingForScan && (
                        <div className="mt-4 flex flex-col items-center gap-2 text-lc-green text-sm">
                          <div className="flex items-center gap-2">
                            <div className={rpcEventDetected ? "" : "lc-spinner"} style={rpcEventDetected ? {} : { width: 14, height: 14, borderWidth: '2px' }} />
                            {rpcEventDetected ? 'Signal received! Finalizing login...' : 'Waiting for connection...'}
                          </div>
                          {showSlowHint && (
                            <div className="flex flex-col items-center gap-3 animate-in fade-in duration-500">
                              <p className="text-xs text-lc-muted text-center">
                                Still waiting? Try switching back to Amber to make sure you approved.
                              </p>
                              <button
                                onClick={() => {
                                  logStatus('LoginModal', 'User clicked Reconnect');
                                  getNDK().connect().catch(e => logStatus('LoginModal', 'Reconnect error', e));
                                }}
                                className="text-xs font-bold text-lc-green hover:underline flex items-center gap-1.5"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                                </svg>
                                Reconnect to Relays
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-8 flex flex-col items-center gap-3">

                      <p className="text-sm text-lc-muted">Generating connection...</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-lc-muted mb-2 font-medium">
                    Paste your bunker URL
                  </label>
                  <input
                    type="text"
                    value={bunkerInput}
                    onChange={(e) => setBunkerInput(e.target.value)}
                    placeholder="bunker://..."
                    className="w-full p-3.5 bg-lc-black border border-lc-border rounded-xl text-lc-white placeholder-lc-border font-mono text-sm focus:outline-none focus:border-lc-green/50 focus:ring-1 focus:ring-lc-green/20 transition"
                  />
                  <p className="mt-2.5 text-xs text-lc-muted">
                    Get this from your nsecBunker or similar remote signer.
                  </p>
                </div>
                <button
                  onClick={() => handleLogin('bunker')}
                  disabled={isLoading || !bunkerInput.trim()}
                  className="w-full lc-pill lc-pill-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
