'use client';

import { useDMStore } from '@/store/dm';
import type { DMProtocol } from '@/lib/dm';
import ModalShell from '@/components/ModalShell';

export default function ProtocolPrompt() {
  const { showProtocolPrompt, setProtocolOverride, setShowProtocolPrompt } = useDMStore();

  if (!showProtocolPrompt) return null;

  const choose = (protocol: DMProtocol) => {
    setProtocolOverride(showProtocolPrompt, protocol);
  };

  return (
    <ModalShell
      onClose={() => setShowProtocolPrompt(null)}
      closeOnBackdrop={false}
      panelClassName="lc-card p-6 max-w-md w-full mx-4 space-y-4"
    >
      <h3 className="text-lg font-semibold text-lc-white">Choose DM Protocol</h3>

      <p className="text-sm text-lc-muted">
        This conversation has messages using <strong className="text-lc-white">NIP-04</strong> (legacy encryption).
        You can choose which protocol to use for sending:
      </p>

      <div className="space-y-3">
        <button
          onClick={() => choose('nip17')}
          className="w-full text-left p-3 rounded-lg border border-lc-border hover:border-lc-green/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-lc-green">NIP-17 (Recommended)</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-lc-green/20 text-lc-green">Private</span>
          </div>
          <p className="text-xs text-lc-muted mt-1">
            Gift-wrapped messages with hidden metadata. The receiver needs a client that supports NIP-17 to read them.
          </p>
        </button>

        <button
          onClick={() => choose('nip04')}
          className="w-full text-left p-3 rounded-lg border border-lc-border hover:border-yellow-500/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-yellow-400">NIP-04 (Legacy)</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">Compatible</span>
          </div>
          <p className="text-xs text-lc-muted mt-1">
            Legacy encrypted DMs. Works with all Nostr clients but leaks metadata (who you are talking to and when).
          </p>
        </button>
      </div>

      <button
        onClick={() => setShowProtocolPrompt(null)}
        className="w-full text-center text-xs text-lc-muted hover:text-lc-white transition-colors pt-1"
      >
        Decide later (defaults to NIP-17)
      </button>
    </ModalShell>
  );
}
