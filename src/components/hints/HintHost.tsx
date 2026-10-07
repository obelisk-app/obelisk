'use client';

/**
 * Decides which hint, if any, is showing right now.
 *
 * Mounted once per shell with the surface the user is currently on. It picks
 * the first unseen hint for that surface whose anchor is actually mounted
 * and laid out, shows it, and moves to the next one when that is dismissed,
 * so a screen with three things to say walks through them at the reader's
 * pace and then goes quiet forever.
 *
 * The "anchor must be visible" rule is what keeps this honest. A hint can
 * never point at nothing, which is also how one registry serves both shells
 * and how conditional UI (voice off, no relays yet, DMs not opted into)
 * drops its own steps without anyone maintaining a condition for it.
 *
 * Using a control counts as learning it: a delegated `pointerdown` marks the
 * hint for whatever `[data-tour]` was clicked, so someone who has already
 * found the feed button is never told what the feed button is.
 */

import { useTranslations } from 'next-intl';
import type { Shell, SurfaceId } from '@/utils/hints/registry';
import { useHintHost } from '@/hooks/hints/useHintHost';
import HintCallout from './HintCallout';

export default function HintHost({
  surface,
  shell,
}: {
  surface: SurfaceId | null;
  shell: Shell;
}) {
  const t = useTranslations();
  const vm = useHintHost(surface, shell);
  if (!vm.hint || !vm.anchorEl) return null;

  return (
    <HintCallout
      anchor={vm.anchorEl}
      title={t(vm.hint.titleKey)}
      body={t(vm.hint.bodyKey)}
      onDismiss={vm.dismiss}
      onMuteAll={vm.muteAll}
    />
  );
}
