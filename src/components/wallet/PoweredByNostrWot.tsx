'use client';

/**
 * "Powered by nostr-wot" attribution legend. Mounted on every wallet
 * surface (connect screen, connected view, send/receive confirmations,
 * zap toast). Links to the nostr-wot project page.
 */
export function PoweredByNostrWot() {
  return (
    <a
      href="https://nostr-wot.com"
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] text-lc-muted hover:text-lc-white inline-flex items-center gap-1 mt-2"
    >
      ⚡ Powered by
      <img
        src="/nostr-wot-logo.svg"
        alt=""
        className="h-3"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      nostr-wot
    </a>
  );
}
