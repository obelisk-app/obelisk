import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useBridge, useMyContactList, useMyFollows } from '@/services/nostr-bridge';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { ensureSocialProfiles } from '@/services/social/profiles';
import { fetchStarterPacks, type StarterPack } from '@/services/social/starter-packs';
import { followStarterPack } from '@/services/social/follow-starter-pack';
import { starterPackFaces, starterPackRow } from '@/utils/social/starter-pack-rows';

/**
 * The starter packs' view model: the packs on the social relays (`null`
 * while they load, `[]` when there are none or the relays failed), each
 * shaped for its card, which pack is being followed, and the follow action.
 */
export function useStarterPacks() {
  const t = useTranslations();
  const relays = usePreferences().socialRelays;
  const follows = useMyFollows();
  const contactEvent = useMyContactList();
  const bridge = useBridge();
  const [packs, setPacks] = useState<StarterPack[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStarterPacks({ relays })
      .then((result) => {
        if (cancelled) return;
        setPacks(result);
        // Names and faces for the members we're about to show, in one query.
        void ensureSocialProfiles(starterPackFaces(result));
      })
      .catch(() => { if (!cancelled) setPacks([]); });
    return () => { cancelled = true; };
  }, [relays]);

  const rows = useMemo(
    () => packs?.map((pack) => starterPackRow(pack, follows)) ?? null,
    [packs, follows],
  );

  const follow = async (pack: StarterPack) => {
    if (!bridge) return;
    setBusy(pack.id);
    try {
      await followStarterPack({ bridge, contactEvent, pack, relays, t });
    } finally {
      setBusy(null);
    }
  };

  return { rows, busy, follow: (pack: StarterPack) => void follow(pack) };
}
