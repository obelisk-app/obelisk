'use client';

/**
 * Forward a message to another channel on the active relay.
 *
 * NIP-29 has no "forward" event, and chat doesn't render `nostr:nevent`
 * quotes, so a forward is a new kind 9 in the target channel carrying the
 * original as a Markdown quote under a one-line attribution. The author is
 * named in plain text, not `nostr:npub`: that would p-tag them (NIP-27, see
 * `publishGroupMessage`) and ping them on every forward.
 */

import { useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { nostrActions, useGroups } from '@/services/nostr-bridge';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';
import { useToastStore } from '@/store/toast';
import { useTranslation } from '@/i18n/context';
import { ForwardIcon, HashIcon } from '@/components/ui/icons';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { MenuItem } from '@/components/ui/menu';

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
    <Modal onClose={onClose} testId="forward-modal" panelClassName="w-[min(420px,calc(100vw-2rem))] rounded-xl border border-lc-border bg-lc-dark p-4 shadow-2xl">
      <div className="mb-3 flex items-center gap-2 text-lc-white">
        <ForwardIcon size={18} />
        <h2 className="text-base font-semibold">{t('message.forwardTitle')}</h2>
      </div>
      <blockquote className="mb-3 line-clamp-3 border-l-2 border-lc-green/40 pl-3 text-sm text-lc-white/80">
        {message.content}
      </blockquote>
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('message.forwardSearch')}
        aria-label={t('message.forwardSearch')}
        className="mb-2"
        data-testid="forward-search"
      />
      <ul className="max-h-72 space-y-0.5 overflow-y-auto" role="menu" aria-label={t('message.forwardTitle')}>
        {targets.length === 0 && (
          <EmptyState as="li" padding="md" className="px-3">{t('message.forwardEmpty')}</EmptyState>
        )}
        {targets.map((g) => (
          <li key={g.id} role="none">
            <MenuItem
              icon={<HashIcon size={15} />}
              label={g.name ?? g.id.slice(0, 12)}
              trailing={sending === g.id ? <Spinner size="sm" /> : undefined}
              disabled={sending !== null}
              onClick={() => void forward(g)}
              testId={`forward-target-${g.id}`}
            />
          </li>
        ))}
      </ul>
    </Modal>
  );
}
