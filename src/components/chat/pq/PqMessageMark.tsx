'use client';

import { useTranslations } from 'next-intl';
import type { PqMessageMark as Mark } from '@/services/chat/pq/status';
import { ShieldCheckIcon } from '@/assets/icons';
import Button from '@/components/ui/buttons/Button';
import { usePqShield } from '@/hooks/chat/pq/usePqShield';

/** Quiet legacy/PQC indicators; standard NIP-17 has no badge. */
export default function PqMessageMark({ mark, onAccent = false }: { mark: Mark; onAccent?: boolean }) {
  const t = useTranslations();
  const { open, wrapRef, panelId, show, hide, toggle, onBlur } = usePqShield();
  if (mark === null) return null;
  const label = mark === 'no-giftwrap' ? t('chat.pq.markNoGiftwrap') : t('chat.pq.markQuantum');
  const detail = mark === 'no-giftwrap' ? t('chat.pq.markNoGiftwrapDetail') : t('chat.pq.markQuantumDetail');
  return <span ref={wrapRef} className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
    <Button variant="bare" data-testid="pq-mark" title={detail} aria-label={`${label}: ${detail}`}
      aria-expanded={open} aria-describedby={open ? panelId : undefined}
      onClick={toggle} onFocus={show} onBlur={onBlur}
      className={`inline-flex items-center rounded px-1 text-[10px] ${onAccent ? 'text-black/60' : 'text-lc-muted'}`}>
      {mark === 'quantum' ? <ShieldCheckIcon size={12} /> : label}
    </Button>
    {open && <span id={panelId} role="tooltip" className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-lg border border-lc-border bg-lc-dark p-3 text-xs text-lc-white shadow-lg">{detail}</span>}
  </span>;
}
