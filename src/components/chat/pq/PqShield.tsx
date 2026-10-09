'use client';

import Button from '@/components/ui/buttons/Button';
import Link from '@/components/ui/navigation/Link';
import { useTranslations } from 'next-intl';
import type { PqProtectionLevel } from '@/services/chat/pq/status';
import { usePqShield } from '@/hooks/chat/pq/usePqShield';
import { ShieldCheckIcon } from '@/assets/icons';

/**
 * The protection indicator for a DM thread: one small shield in the header,
 * with the explanation behind a hover or a tap.
 *
 * This replaces a full-width banner that sat permanently above every
 * conversation. The banner was accurate but disproportionate: a standing
 * yellow warning for the ordinary case, which is the state almost every Nostr
 * conversation is in and will stay in for a while. A warning that never goes
 * away stops being read, and this one also had nothing good to say about the
 * gift wrap that *was* protecting the user.
 *
 * So the shield reports all three rungs, and only the top one is coloured.
 * `wrapped` and `basic` are neutral: they are states to understand, not
 * alarms.
 */

const TONE: Record<PqProtectionLevel, string> = {
  quantum: 'text-lc-green',
  // Neutral on purpose. These are not warnings.
  wrapped: 'text-lc-muted hover:text-lc-white',
  basic: 'text-lc-muted hover:text-lc-white',
};

export default function PqShield({
  level,
  guideHref,
}: {
  level: PqProtectionLevel;
  guideHref: string;
}) {
  const t = useTranslations();
  // Pointer users get it on hover, but the panel holds a link, so touch and
  // keyboard need a real toggle (`usePqShield`).
  const { open, wrapRef, panelId, show, hide, toggle, onBlur } = usePqShield();

  if (level === 'wrapped') return null;
  const label = t(`chat.pq.level.${level}`);
  const detail = t(`chat.pq.level.${level}Detail`);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex shrink-0"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <Button
        variant="bare"
        type="button"
        data-testid="pq-shield"
        data-level={level}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        // The visible panel is hover-dependent, so the button carries the
        // whole statement itself for anyone who never sees it.
        aria-label={`${label}. ${detail}`}
        onClick={toggle}
        onFocus={show}
        onBlur={onBlur}
        className={`rounded p-1 transition-colors ${TONE[level]}`}
      >
        {level === 'quantum' ? <ShieldCheckIcon /> : label}
      </Button>

      {open && (
        <span
          id={panelId}
          role="tooltip"
          className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-lc-border bg-lc-dark p-3 text-left shadow-lg"
        >
          <span className={`block text-xs font-semibold ${level === 'quantum' ? 'text-lc-green' : 'text-lc-white'}`}>
            {label}
          </span>
          <span className="mt-1 block text-xs leading-snug text-lc-muted">{detail}</span>
          {level !== 'quantum' && (
            <Link
              href={guideHref}
              variant="prose" className="mt-2 inline-block text-xs font-medium"
            >
              {t('chat.pq.learnHow')}
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
