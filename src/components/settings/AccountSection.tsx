'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nip19 } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';
import { useAuthStore } from '@/store/auth';
import { useSettingsStore } from '@/store/settings';

const SIGNER_PAYLOAD_KEY = 'obelisk-signer-payload';

function readStoredNsec(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SIGNER_PAYLOAD_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.type !== 'nsec' || !payload.privkey) return null;
    return nip19.nsecEncode(hexToBytes(payload.privkey));
  } catch {
    return null;
  }
}

const METHOD_LABEL: Record<string, string> = {
  extension: 'Extensión del navegador (NIP-07)',
  nsec: 'Clave privada (nsec)',
  bunker: 'Firmante remoto (NIP-46 / bunker)',
};

export default function AccountSection() {
  const router = useRouter();
  const loginMethod = useAuthStore((s) => s.loginMethod);
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const closeSettings = useSettingsStore((s) => s.close);

  const [nsec, setNsec] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (loginMethod === 'nsec') setNsec(readStoredNsec());
    else setNsec(null);
  }, [loginMethod]);

  const handleCopy = async () => {
    if (!nsec) return;
    try {
      await navigator.clipboard.writeText(nsec);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleLogout = () => {
    logout();
    closeSettings();
    router.push('/');
  };

  return (
    <div className="space-y-6" data-testid="settings-account-section">
      <div>
        <h2 className="text-lc-white text-xl font-semibold">Cuenta</h2>
        <p className="text-sm text-lc-muted mt-1">
          Información sobre cómo estás conectado a Obelisk.
        </p>
      </div>

      <div className="lc-card p-4 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-1">
            Método de autenticación
          </div>
          <div className="text-sm text-lc-white" data-testid="settings-account-method">
            {loginMethod ? METHOD_LABEL[loginMethod] : '—'}
          </div>
        </div>

        {profile?.npub && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-1">
              Clave pública (npub)
            </div>
            <div className="text-xs text-lc-white font-mono break-all">{profile.npub}</div>
          </div>
        )}

        {loginMethod === 'nsec' && nsec && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-1">
              Clave privada (nsec)
            </div>
            <p className="text-xs text-red-400 mb-2">
              Nunca compartas tu nsec. Cualquiera que la tenga controla tu identidad.
            </p>
            {revealed ? (
              <div className="space-y-2">
                <div
                  className="text-xs text-lc-white font-mono break-all bg-lc-black border border-lc-border rounded-md p-3"
                  data-testid="settings-account-nsec"
                >
                  {nsec}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="lc-pill-secondary text-xs px-3 py-1.5"
                  >
                    {copied ? '¡Copiado!' : 'Copiar'}
                  </button>
                  <button
                    onClick={() => setRevealed(false)}
                    className="lc-pill-secondary text-xs px-3 py-1.5"
                  >
                    Ocultar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setRevealed(true)}
                className="lc-pill-secondary text-xs px-3 py-1.5"
                data-testid="settings-account-reveal-nsec"
              >
                Mostrar nsec
              </button>
            )}
          </div>
        )}
      </div>

      <div className="lc-card p-4 border-red-500/30">
        <div className="text-sm text-lc-white font-semibold mb-1">Cerrar sesión</div>
        <p className="text-xs text-lc-muted mb-3">
          Se borrará la sesión de este dispositivo. Vas a necesitar tu clave o firmante para volver a entrar.
        </p>
        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
          data-testid="settings-account-logout"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
