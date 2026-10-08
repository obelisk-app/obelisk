'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdmins, useMembers, type JsGroup } from '@/services/nostr-bridge';
import type { SfuEndpointInfo } from '@/services/voice/sfu-pin';
import { addMemberForm, channelMetaForm } from '@/services/chat/channel/channel-settings-form';
import { useForm } from '@/hooks/common/useForm';
import { voiceErrorMessage } from '@/utils/voice/error-text';

export interface SfuVerification {
  readonly pubkey: string;
  readonly cap: number | null;
  readonly region: string | null;
}

const DEFAULT_SFU_URL = 'https://sfu.obelisk.ar';

/**
 * The channel settings screen (desktop modal and phone sheet): two common
 * forms, the metadata (`channelMetaForm`) and adding a member
 * (`addMemberForm`), plus what no other form has, the SFU check. It stays a
 * hook because the SFU URL is seeded from the channel's signed pin (read
 * after open), its `/info` check has its own busy flag and result, and a
 * failed check speaks through the metadata form's error line.
 */
export function useChannelSettingsForm(group: JsGroup, onSaved: () => void) {
  const t = useTranslations();
  const members = useMembers(group.id);
  const admins = useAdmins(group.id);
  const adminSet = useMemo(() => new Set(admins), [admins]);
  const allPubkeys = useMemo(() => Array.from(new Set<string>([...admins, ...members])), [admins, members]);

  // A channel admin only chooses the SFU URL. `/info` supplies the identity
  // and relay compatibility fallback stored in the signed NIP-78 pin.
  const [sfuUrl, setSfuUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<SfuVerification | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { resolveSfuPin } = await import('@/services/voice/sfu-pin');
      const pin = await resolveSfuPin(group.id, 800);
      if (cancelled) return;
      setSfuUrl(pin?.url ?? process.env.NEXT_PUBLIC_SFU_URL ?? DEFAULT_SFU_URL);
      setVerified(null);
    })();
    return () => { cancelled = true; };
  }, [group.id]);

  const meta = useForm(channelMetaForm(group, { url: sfuUrl, verify: () => verifySfu().catch(() => null) }, onSaved));
  const member = useForm(addMemberForm(group.id));

  /** Probe `/info` on the SFU; resolves to the endpoint info, or records the error and throws. */
  async function verifySfu(): Promise<SfuEndpointInfo> {
    const url = sfuUrl.trim();
    if (!url) {
      const message = t('chat.channelSettings.sfuUrlRequired');
      meta.setError(message);
      throw new Error(message);
    }
    setChecking(true);
    meta.setError(null);
    try {
      const { fetchSfuInfo } = await import('@/services/voice/sfu-pin');
      const info = await fetchSfuInfo(url);
      setSfuUrl(info.url);
      setVerified({ pubkey: info.pubkey, cap: info.cap, region: info.region });
      return info;
    } catch (err) {
      setVerified(null);
      meta.setError(voiceErrorMessage(t, err, 'sfuInfoHttp'));
      throw err;
    } finally {
      setChecking(false);
    }
  }

  return {
    meta,
    member,
    /** Only meaningful while the kind is `voice-sfu`. */
    sfu: { url: sfuUrl, setUrl: setSfuUrl, checking, verified, verify: verifySfu },
    members,
    admins,
    adminSet,
    /** Admins first, then members, deduplicated: what the phone sheet lists. */
    allPubkeys,
  };
}
