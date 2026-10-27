import type { MessageKey } from '@/i18n/keys';

/**
 * Copy the `@nostr-wot/ui` login widget (0.8.x, and 2.0.x unchanged) writes
 * in English with no prop to override it, mapped to the Obelisk message that
 * replaces it (`services/session/sdk-login-copy.ts`). Keys are the widget's
 * text with whitespace collapsed; the same table covers text nodes,
 * placeholders and aria-labels. Em dashes are written as `\u2014` because the
 * repo bans the character itself.
 *
 * Left out on purpose: what Obelisk hides or rewrites elsewhere ("Remember on
 * this device", "Skip for now", the "Optional." line, "About", the npub block,
 * "Satoshi") and the NIP-46 connection labels, which have a real prop.
 */
export const SDK_LOGIN_COPY: Readonly<Record<string, MessageKey>> = {
  'Sign in to Nostr': 'shell.login.title',
  Close: 'common.close',
  '← Back': 'shell.login.sdk.back',
  'Signing in': 'shell.login.sdk.signingIn',
  'Signing in…': 'shell.login.sdk.signingIn',
  'Connecting': 'shell.login.connecting',

  'Browser extension': 'shell.login.sdk.methods.extension',
  'NIP-07 \u2014 Alby, nos2x, Flamingo': 'shell.login.sdk.methods.extensionHint',
  'Remote signer (bunker)': 'shell.login.sdk.methods.bunker',
  'NIP-46 \u2014 Amber, Nsec.app, Keychat': 'shell.login.sdk.methods.bunkerHint',
  'Create a new account': 'shell.login.sdk.methods.generate',
  'Generates a fresh keypair on this device': 'shell.login.sdk.methods.generateHint',
  'Paste private key': 'shell.login.sdk.methods.import',
  'nsec or 64-char hex \u2014 risky in browsers': 'shell.login.sdk.methods.importHint',

  'Get the Nostr WoT extension': 'shell.login.sdk.noExtension.title',
  'Browser extension with NIP-07 signer + Web of Trust spam filtering ↗': 'shell.login.sdk.noExtension.hint',
  'No NIP-07 extension detected. Install Alby, nos2x, or another Nostr signer extension and reload.':
    'shell.login.sdk.noExtension.error',

  '⚠️ Pasting your private key into a web page is risky. Prefer a browser extension (NIP-07) or a remote signer (NIP-46) when possible.':
    'shell.login.sdk.import.warning',
  'nsec1… or 64-char hex': 'shell.login.sdk.import.placeholder',
  'Sign in': 'shell.login.sdk.import.signIn',
  'Paste an nsec1… or a 64-char hex private key.': 'shell.login.sdk.import.invalidKey',
  'Invalid nsec': 'shell.login.sdk.import.invalidNsec',

  'Your new key': 'shell.login.sdk.generated.title',
  'Back this up': 'shell.login.sdk.generated.backupLead',
  before: 'shell.login.sdk.generated.backupWhen',
  'you continue. Lose it and your identity is gone \u2014 there\'s no recovery.': 'shell.login.sdk.generated.backupTail',
  'Private key (nsec) \u2014 keep secret': 'shell.login.sdk.generated.nsecLabel',
  'Copy nsec': 'shell.login.sdk.generated.copyNsec',
  'Download .txt': 'shell.login.sdk.generated.download',
  'I have backed up my nsec. I understand that losing it means losing access to this account permanently.':
    'shell.login.sdk.generated.acknowledge',
  Continue: 'shell.login.sdk.generated.continue',

  'Set up your profile': 'shell.login.sdk.profile.title',
  'Display name': 'shell.login.sdk.profile.displayName',
  'Builder, chef, occasional cyclist.': 'shell.login.sdk.profile.aboutPlaceholder',
  'Save profile and continue': 'shell.login.sdk.profile.save',
  'Publishing': 'shell.login.sdk.profile.publishing',

  'Scan QR': 'shell.login.sdk.bunker.scanQr',
  'Action required': 'shell.login.sdk.bunker.authTitle',
  'Approve the request in your signer app, then this will continue automatically. Click to open ↗':
    'shell.login.sdk.bunker.authBody',
  'Nostr Connect QR code': 'shell.login.sdk.bunker.qrLabel',
  'Scan with Amber, Nsec.app, Keychat, or any NIP-46 signer.': 'shell.login.sdk.bunker.qrHint',
  'Still waiting? Some signer apps default to "scan once" \u2014 try re-opening the scanner.': 'shell.login.sdk.bunker.slowHint',
  'Restart': 'shell.login.sdk.bunker.restart',
  'Generating QR…': 'shell.login.sdk.bunker.generatingQr',
  'Paste a bunker:// URI from your remote signer': 'shell.login.sdk.bunker.pasteLabel',
  'Paste a bunker:// URI from your remote signer.': 'shell.login.sdk.bunker.pasteLabel',
  'Connect': 'shell.login.sdk.bunker.connect',
};
