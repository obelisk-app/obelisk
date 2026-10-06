/**
 * What the relay status row says for a connection state and relay access
 * state, in the reader's language. The bridge reports the connection state
 * as an English token (`Connected`, `Connecting`, `Offline`, `Disconnected`,
 * `Error:<code or socket text>`); these helpers turn it into copy. A known
 * error code reads in the reader's language; a relay's own words pass through.
 */

import type { RelayAccessState } from '@/services/nostr-bridge';
import type { Translate } from '@/i18n/keys';
import { errorText } from '@/utils/errors/error-text';

type LoginMethod = 'nsec' | 'nip07' | 'bunker' | null;

export type Severity = 'info' | 'warn' | 'error';

export interface RelayStatus {
  state: string;
  severity: Severity;
  label: string;
  detail?: string;
  spinner?: boolean;
}

export function relayStatus(
  conn: string,
  access: RelayAccessState,
  loginMethod: LoginMethod,
  host: string,
  t: Translate,
): RelayStatus | null {
  // ── Connection-state takes precedence ────────────────────────────
  if (conn === 'Offline') {
    return {
      state: 'offline',
      severity: 'warn',
      label: t('shell.status.offline.title'),
      detail: t('shell.status.offline.body'),
    };
  }
  if (conn === 'Connecting') {
    return {
      state: 'connecting',
      severity: 'warn',
      label: t('shell.status.connecting.title', { host }),
      detail: t('shell.status.connecting.body'),
      spinner: true,
    };
  }
  if (conn === 'Disconnected') {
    return {
      state: 'disconnected',
      severity: 'error',
      label: t('shell.status.disconnected.title'),
      detail: t('shell.status.disconnected.body'),
      spinner: true,
    };
  }
  if (conn.startsWith('Error:')) {
    return {
      state: 'error',
      severity: 'error',
      label: t('shell.status.cannotReach', { host }),
      detail: connectionError(conn, t),
    };
  }
  // conn === 'Connected' from here.
  if (access === 'authenticating') {
    const detail =
      loginMethod === 'bunker'
        ? t('shell.status.authenticating.bunker')
        : loginMethod === 'nip07'
          ? t('shell.status.authenticating.nip07')
          : t('shell.status.authenticating.local');
    return {
      state: 'authenticating',
      severity: 'warn',
      label: t('shell.status.authenticating.title', { host }),
      detail,
      spinner: true,
    };
  }
  if (access === 'auth-required') {
    return {
      state: 'auth-required',
      severity: 'warn',
      label: t('shell.status.authRequired.title', { host }),
      detail:
        loginMethod === 'bunker' || loginMethod === 'nip07'
          ? t('shell.status.authRequired.reapprove')
          : t('shell.status.authRequired.reload'),
    };
  }
  if (access === 'restricted') {
    return {
      state: 'restricted',
      severity: 'error',
      label: t('shell.status.restricted.title', { host }),
      detail: t('shell.status.restricted.body'),
    };
  }
  if (access === 'unreachable') {
    return {
      state: 'unreachable',
      severity: 'error',
      label: t('shell.status.cannotReach', { host }),
      detail: t('shell.status.unreachable.body'),
    };
  }
  if (access === 'error') {
    return {
      state: 'error',
      severity: 'error',
      label: t('shell.status.error.title', { host }),
      detail: t('shell.status.error.body'),
    };
  }
  // 'ok' or 'unknown' - nothing to surface.
  return null;
}

/** The connection state alone, for the dot beside the relay name. */
export function connectionLabel(conn: string, t: Translate): string {
  if (conn === 'Connected') return t('shell.status.connection.connected');
  if (conn === 'Connecting') return t('shell.status.connection.connecting');
  if (conn === 'Offline') return t('shell.status.connection.offline');
  if (conn.startsWith('Error:')) return t('shell.status.connection.error', { detail: connectionError(conn, t) });
  return t('shell.status.connection.disconnected');
}

/** The part after `Error:`: a code from the bridge, or a relay's own words. */
function connectionError(conn: string, t: Translate): string {
  return errorText(t, conn.slice('Error:'.length).trim());
}
