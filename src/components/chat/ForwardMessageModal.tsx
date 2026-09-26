'use client';

/**
 * Forward a message to another channel on the active relay.
 *
 * NIP-29 has no "forward" event, and chat doesn't render `nostr:nevent`
 * quotes, so a forward is a new kind 9 in the target channel carrying the
 * original as a Markdown quote under a one-line attribution. The author is
 * named in plain text, not `nostr:npub` — that would p-tag them (NIP-27, see
 * `publishGroupMessage`) and ping them on every forward.
 */

import { useMemo, useState } from 'react';
import ModalShell from '@/components/ModalShell';
import { nostrActions, useGroups } from '@/lib/nostr-bridge';
import type { JsGroup, JsMessage } from '@/lib/nostr-bridge';
import { useToastStore } from '@/store/toast';
import { useTranslation } from '@/i18n/context';
import { ForwardIcon, HashIcon } from '@/components/ui/icons';

/** The forwarded message body. Exported for tests. */
export function forwardedContent(
  msg: Pick<JsMessage, 'content'>,
  opts: { authorName: string; fromChannel: string | null; label: string },
): string {
  const where = opts.fromChannel ? ` #${opts.fromChannel}` : '';
  const quoted = msg.content.split('\n').map((line) => `> ${line}`).join('\n');
  return `**${opts.label}**${where} · ${opts.authorName}\n${quoted}`;
}

export default function ForwardMessageModal({
  message,
  authorName,
  fromGroupId,
  onClose,
}: {
  message: JsMessage;
  authorName: string;
  fromGroupId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const groups = useGroups();
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const fromName = groups.find((g) => g.id === fromGroupId)?.name ?? null;

  const targets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((g: JsGroup) => g.id !== fromGroupId && g.kind !== 'voice' && g.kind !== 'voice-sfu' && g.kind !== 'forum')
      .filter((g) => !q || (g.name ?? g.id).toLowerCase().includes(q))
      .slice(0, 50);
  }, [groups, query, fromGroupId]);

  const forward = async (target: JsGroup) => {
    setSending(target.id);
    try {
      await nostrActions.sendMessage(
        target.id,
        forwardedContent(message, { authorName, fromChannel: fromName, label: t('message.forwarded') }),
      );
      useToastStore.getState().pushToast({
        title: t('message.forwardedTo').replace('{channel}', target.name ?? target.id.slice(0, 8)),
        body: '',
      });
      onClose();
    } catch (e) {
      useToastStore.getState().pushToast({ title: t('message.forwardFailed'), body: e instanceof Error ? e.message : String(e) });
      setSending(null);
    }
  };

  return (
    <ModalShell onClose={onClose} testId="forward-modal" panelClassName="w-[min(420px,calc(100vw-2rem))] rounded-xl border border-lc-border bg-lc-dark p-4 shadow-2xl">
      <div className="mb-3 flex items-center gap-2 text-lc-white">
        <ForwardIcon size={18} />
        <h2 className="text-base font-semibold">{t('message.forwardTitle')}</h2>
      </div>
      <blockquote className="mb-3 line-clamp-3 border-l-2 border-lc-green/40 pl-3 text-sm text-lc-white/80">
        {message.content}
      </blockquote>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('message.forwardSearch')}
        className="mb-2 w-full rounded-lg border border-lc-border bg-lc-black px-3 py-2 text-sm text-lc-white placeholder:text-lc-muted focus:border-lc-green/60 focus:outline-none"
        data-testid="forward-search"
      />
      <ul className="max-h-72 space-y-0.5 overflow-y-auto" role="listbox" aria-label={t('message.forwardTitle')}>
        {targets.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-lc-muted">{t('message.forwardEmpty')}</li>
        )}
        {targets.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              disabled={sending !== null}
              onClick={() => void forward(g)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-lc-white transition-colors hover:bg-lc-green/15 disabled:opacity-50"
              data-testid={`forward-target-${g.id}`}
            >
              <span className="text-lc-muted"><HashIcon size={15} /></span>
              <span className="min-w-0 flex-1 truncate">{g.name ?? g.id.slice(0, 12)}</span>
              {sending === g.id && <span className="lc-spinner h-4 w-4" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
    </ModalShell>
  );
}
