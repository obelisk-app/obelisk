// src/store/notificationPrefs.ts
// Zustand store for NotificationPreference rows. Hydrated once on login,
// then updated optimistically with API rollback on failure.

import { create } from 'zustand';
import { resolveScope, type NotificationPreference, type ResolvedPref } from '@/lib/notifications/prefs';
import type { ScopeRef } from '@/lib/server/scope-chain';

const ENDPOINT = '/api/notification-preferences';

export interface PrefPatch {
  notifyLevel?: 'all' | 'mentions' | 'nothing' | null;
  mutedUntil?: string | null;
}

interface NotificationPrefsState {
  prefs: NotificationPreference[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPref: (scope: ScopeRef, patch: PrefPatch) => Promise<void>;
  resetPref: (scope: ScopeRef) => Promise<void>;
  resolve: (scopeChain: ScopeRef[]) => ResolvedPref;
}

function findIndex(prefs: NotificationPreference[], scope: ScopeRef): number {
  return prefs.findIndex((p) => p.scopeType === scope.type && p.scopeId === scope.id);
}

export const useNotificationPrefsStore = create<NotificationPrefsState>((set, get) => ({
  prefs: [],
  hydrated: false,

  hydrate: async () => {
    const res = await fetch(ENDPOINT, { credentials: 'include' });
    if (!res.ok) {
      set({ hydrated: true });
      return;
    }
    const body = await res.json();
    set({ prefs: body.prefs ?? [], hydrated: true });
  },

  setPref: async (scope, patch) => {
    const before = get().prefs;
    const optimistic: NotificationPreference = {
      id: `tmp_${scope.type}_${scope.id}`,
      pubkey: '',
      scopeType: scope.type,
      scopeId: scope.id,
      notifyLevel: patch.notifyLevel ?? null,
      mutedUntil: patch.mutedUntil ?? null,
    };
    const idx = findIndex(before, scope);
    const next = idx === -1
      ? [...before, optimistic]
      : before.map((p, i) => i === idx ? { ...p, ...patch } : p);
    set({ prefs: next });

    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, ...patch }),
    });
    if (!res.ok) {
      set({ prefs: before });
      throw new Error('failed to save preference');
    }
    const body = await res.json();
    if (body.pref) {
      set({
        prefs: get().prefs.map((p) => (p.scopeType === scope.type && p.scopeId === scope.id ? body.pref : p)),
      });
    }
  },

  resetPref: async (scope) => {
    const before = get().prefs;
    set({ prefs: before.filter((p) => !(p.scopeType === scope.type && p.scopeId === scope.id)) });
    const res = await fetch(ENDPOINT, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id }),
    });
    if (!res.ok) {
      set({ prefs: before });
      throw new Error('failed to delete preference');
    }
  },

  resolve: (scopeChain) => resolveScope(get().prefs, scopeChain),
}));
