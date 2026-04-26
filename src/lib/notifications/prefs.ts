// src/lib/notifications/prefs.ts
// Pure resolver. Walks the scope chain most-specific → least-specific and
// composes a single ResolvedPref. NotifyLevel and mutedUntil resolve
// independently — a channel can have notifyLevel='all' AND a parent server
// muted; both fields surface on the result.

import type { ScopeRef } from '@/lib/server/scope-chain';

export interface NotificationPreference {
  id: string;
  pubkey: string;
  scopeType: 'server' | 'channel' | 'dm' | string;
  scopeId: string;
  notifyLevel: 'all' | 'mentions' | 'nothing' | null;
  mutedUntil: string | Date | null;
}

export interface ResolvedPref {
  notifyLevel: 'all' | 'mentions' | 'nothing';
  mutedUntil: Date | null;
}

const DEFAULT: ResolvedPref = { notifyLevel: 'mentions', mutedUntil: null };

function findPref(
  prefs: NotificationPreference[],
  scope: ScopeRef,
): NotificationPreference | undefined {
  return prefs.find((p) => p.scopeType === scope.type && p.scopeId === scope.id);
}

export function resolveScope(
  prefs: NotificationPreference[],
  scopeChain: ScopeRef[],
  now: Date = new Date(),
): ResolvedPref {
  let notifyLevel: ResolvedPref['notifyLevel'] | null = null;
  let mutedUntil: Date | null = null;

  for (const scope of scopeChain) {
    const pref = findPref(prefs, scope);
    if (!pref) continue;
    if (notifyLevel === null && pref.notifyLevel) {
      notifyLevel = pref.notifyLevel;
    }
    if (!mutedUntil && pref.mutedUntil) {
      const until = pref.mutedUntil instanceof Date ? pref.mutedUntil : new Date(pref.mutedUntil);
      if (until > now) mutedUntil = until;
    }
  }

  return {
    notifyLevel: notifyLevel ?? DEFAULT.notifyLevel,
    mutedUntil,
  };
}
