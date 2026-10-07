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

import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Input from '@/components/ui/forms/Input';
import type { JsMessage } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import { ForwardIcon, HashIcon } from '@/assets/icons';
import Spinner from '@/components/ui/feedback/Spinner';
import EmptyState from '@/components/ui/feedback/EmptyState';
import { MenuItem } from '@/components/ui/overlays/menu';
import { useForwardMessageModal } from '@/hooks/chat/message/useForwardMessageModal';

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
  const t = useTranslations();
  const vm = useForwardMessageModal(message, authorName, fromGroupId, onClose);

  return (
    <Modal onClose={onClose} testId="forward-modal" panelClassName="flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-2xl">
      <ModalHeader title={t('chat.message.forwardTitle')} icon={<ForwardIcon size={18} />} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <blockquote className="mb-3 line-clamp-3 border-l-2 border-lc-green/40 pl-3 text-sm text-lc-white/80">
          {message.content}
        </blockquote>
        <Input
          autoFocus
          value={vm.query}
          onChange={(e) => vm.setQuery(e.target.value)}
          placeholder={t('chat.message.forwardSearch')}
          aria-label={t('chat.message.forwardSearch')}
          className="mb-2"
          data-testid="forward-search"
        />
        <ul className="max-h-72 space-y-0.5 overflow-y-auto" role="menu" aria-label={t('chat.message.forwardTitle')}>
          {vm.targets.length === 0 && (
            <EmptyState as="li" padding="md" className="px-3">{t('chat.message.forwardEmpty')}</EmptyState>
          )}
          {vm.targets.map((g) => (
            <li key={g.id} role="none">
              <MenuItem
                icon={<HashIcon size={15} />}
                label={g.name ?? g.id.slice(0, 12)}
                trailing={vm.sending === g.id ? <Spinner size="sm" /> : undefined}
                disabled={vm.sending !== null}
                onClick={() => void vm.forward(g)}
                testId={`forward-target-${g.id}`}
              />
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
