'use client';

import { useEffect } from 'react';
import { copyConnectionUri, signerAppHref } from '@/app/app/login/signer-link';

/**
 * Local patch for an "Open in signer app" deep-link button inside the SDK's
 * NIP-46 QR view. The fork at `../nostr-wot-sdk` already implements this
 * (Nip46Method.tsx:323-331) but it's missing from the published npm v0.6.0
 * that we currently consume. This sidecar finds the rendered `nostrconnect://`
 * URI in the DOM and inserts a tappable `<a>` below the QR, useful on mobile
 * where the user can't scan their own screen but can hand off to Amber, Nsec.app,
 * Keychat, etc. via the registered URL scheme.
 *
 * The SDK remounts its modal when a cancelled connection rotates the QR, so
 * the observer lives on document.body and follows the replacement overlay.
 *
 * TODO: once @nostr-wot/ui publishes a version with the native button, delete
 *       this hook, its component and the matching `.nui-open-signer` CSS rule.
 */
export function useNip46SignerDeepLink(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    let injected: HTMLElement | null = null;

    const removeInjected = () => {
      if (injected && injected.isConnected) injected.remove();
      injected = null;
    };

    const sync = () => {
      const qrWrap = document.querySelector<HTMLElement>('.nui-modal .nui-qr-wrap');
      const uri = qrWrap?.querySelector<HTMLElement>('.nui-key-display')?.textContent?.trim();
      const pasteTab = document.querySelector<HTMLButtonElement>('.nui-modal .nui-tabs [role="tab"]:last-child');
      if (pasteTab?.textContent?.trim() === 'Paste URI') pasteTab.textContent = 'Use bunker URI';

      if (!qrWrap || !uri || !uri.startsWith('nostrconnect://')) {
        removeInjected();
        return;
      }
      if (injected && injected.isConnected && injected.dataset.nostrconnect === uri) return;

      removeInjected();
      const actions = document.createElement('div');
      actions.className = 'nui-signer-actions';
      actions.dataset.nostrconnect = uri;
      const a = document.createElement('a');
      a.href = signerAppHref(uri, navigator.userAgent);
      a.className = 'nui-open-signer';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', () => { void copyConnectionUri(uri); });
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗'; // ↗
      const label = document.createElement('span');
      label.textContent = 'Open in signer app';
      a.append(arrow, label);
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'nui-copy-signer';
      copy.textContent = 'Copy connection URI';
      copy.addEventListener('click', async () => {
        copy.textContent = await copyConnectionUri(uri) ? 'Copied' : 'Copy failed: select URI below';
      });
      const hint = document.createElement('p');
      hint.className = 'nui-signer-copy-hint';
      hint.textContent = 'Fallback: copy it, then in Amber open New application → Paste from clipboard.';
      actions.append(a, copy, hint);
      const qr = qrWrap.querySelector('.nui-qr');
      if (qr) qr.insertAdjacentElement('afterend', actions);
      else qrWrap.append(actions);
      injected = actions;
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    sync();

    return () => {
      observer.disconnect();
      removeInjected();
    };
  }, []);
}

/** Mounted beside the SDK modal while its picker is open; renders nothing itself. */
export function Nip46SignerDeepLink(): null {
  useNip46SignerDeepLink();
  return null;
}
