'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { nostrActions } from '@/services/nostr-bridge';
import { confirmDialog } from '@/services/confirm-dialog';
import {
  CONFIRM_KEYS,
  LOCAL_DATA_CATEGORIES,
  categoryById,
  measureLocalData,
  measureWebStorage,
  removeEverything,
  removeLocalDataCategory,
  type LocalDataCategoryId,
  type LocalDataUsage,
  type RemovalEnv,
} from '@/services/local-data';
import { unlocalizedPath } from '@/utils/seo/alternates';
import { disconnectNwcWallet } from '@/services/wallet/nwc-wallet';

/** The page-level steps a removal needs: log out, reload, reload without the language prefix. */
export function browserRemovalEnv(): RemovalEnv {
  return {
    logout: () => nostrActions.logout(),
    disconnectWallet: () => disconnectNwcWallet(),
    reload: () => window.location.reload(),
    relocate: () => {
      const { pathname, search, hash } = window.location;
      window.location.replace(`${unlocalizedPath(pathname)}${search}${hash}`);
    },
  };
}

/**
 * Settings > Data on this device: the categories with their measured size,
 * and the removals behind them. Every removal asks first, in the shared
 * confirm dialog, with the category's own sentence of what will happen.
 */
export function useClearLocalData(env: RemovalEnv = browserRemovalEnv()) {
  const t = useTranslations();
  // `null` until the first measure: the panel shows a skeleton meanwhile.
  const [usage, setUsage] = useState<LocalDataUsage | null>(null);
  const [busy, setBusy] = useState<LocalDataCategoryId | 'all' | null>(null);
  // The first env wins: a removal in flight keeps the steps it started with.
  const [stableEnv] = useState(env);

  const refresh = useCallback(() => {
    // Async on purpose: Cache Storage can only be read that way, and the
    // skeleton covers the moment it takes.
    void measureLocalData().then(setUsage, () => setUsage(measureWebStorage()));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const removeCategory = useCallback(async (id: LocalDataCategoryId): Promise<boolean> => {
    const category = categoryById(id);
    const ok = await confirmDialog({
      title: t(category.titleKey),
      message: t(CONFIRM_KEYS[id]),
      confirmLabel: t('settings.localData.confirm.action'),
    });
    if (!ok) return false;
    setBusy(id);
    await removeLocalDataCategory(id, stableEnv);
    // Only the offline files leave the page as it is; the rest reload.
    if (category.after === 'none') {
      setBusy(null);
      refresh();
    }
    return true;
  }, [refresh, stableEnv, t]);

  const removeAll = useCallback(async (): Promise<boolean> => {
    const ok = await confirmDialog({
      title: t('settings.localData.confirm.titleAll'),
      message: t('settings.localData.confirm.all'),
      confirmLabel: t('settings.localData.confirm.actionAll'),
    });
    if (!ok) return false;
    setBusy('all');
    await removeEverything(stableEnv);
    return true;
  }, [stableEnv, t]);

  return { categories: LOCAL_DATA_CATEGORIES, usage, busy, removeCategory, removeAll };
}
