'use client';

import { useState } from 'react';
import type { JsMediaPack } from '@/services/nostr-bridge';
import type { EditablePack, MediaTransfer } from '@/types/media/library';
import { newPack } from '@/utils/media/library/pack-utils';
import { mediaMergePreview } from '@/utils/media/library/merge-preview';
import { useTranslations } from 'next-intl';

/** Choose sources and a destination; previewing only changes an editor draft. */
export function useMediaTransfer({ transfer, packs, myPubkey, serverDraft, onPreview }: {
  transfer: MediaTransfer;
  packs: readonly JsMediaPack[];
  myPubkey: string | null | undefined;
  serverDraft?: EditablePack;
  onPreview: (draft: EditablePack) => void;
}) {
  const t = useTranslations();
  const [addresses, setAddresses] = useState<readonly string[]>(transfer.addresses);
  const [destination, setDestination] = useState(transfer.destination ? 'draft' : serverDraft ? 'server' : 'new');
  const [error, setError] = useState<string | null>(null);
  const owned = packs.filter((pack) => pack.author === myPubkey);
  const toggle = (address: string) => setAddresses((previous) => previous.includes(address)
    ? previous.filter((value) => value !== address) : [...previous, address]);
  const preview = () => {
    try {
      const pack = owned.find((value) => value.address === destination);
      const base = destination === 'draft' ? transfer.destination : destination === 'server' ? serverDraft : pack
        ? { ...pack, owner: pack.author, baseCreatedAt: pack.createdAt }
        : { ...newPack(t('media.pack.newTitle')), owner: myPubkey ?? undefined };
      if (!base) return;
      const incoming = [...transfer.items, ...addresses.flatMap((address) => packs.find((value) => value.address === address)?.items ?? [])];
      const report = mediaMergePreview(base.items, incoming);
      onPreview({ ...base, items: report.items, mergeReview: report });
    } catch {
      setError(t('media.error.invalidItems'));
    }
  };
  return { addresses, destination, setDestination, owned, toggle, preview, error };
}
