'use client';

import List from '@/components/ui/layout/List';
import Button from '@/components/ui/buttons/Button';
import Modal from '@/components/ui/overlays/Modal';
import { useTranslations } from 'next-intl';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import Chip from '@/components/ui/data/Chip';
import { useStackerKeysPanel } from '@/hooks/games/stacker/useStackerKeysPanel';

/**
 * Rebind the controls.
 *
 * Bindings live in localStorage, per browser: they are a property of the
 * keyboard in front of you, not of your account, so they have no business on
 * the relay. An action can hold several keys (the defaults bind rotate to
 * both ↑ and X), so binding one key never clears the others.
 */
export default function StackerKeysPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const vm = useStackerKeysPanel();

  return (
    <Modal
      onClose={onClose}
      testId="stacker-keys-panel"
      panelClassName="w-full max-w-sm mx-4 rounded-xl border border-lc-border bg-lc-dark shadow-xl flex flex-col overflow-hidden max-h-[85vh]"
    >
      <ModalHeader title={t('games.controls')} subtitle={t('games.controlsHelp')} onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <List marker="none" spacing="none" className="space-y-1.5" data-testid="stacker-key-list">
          {vm.rows.map((row) => (
            <li key={row.action} className="flex items-center gap-2">
              <span className="flex-1 text-xs text-lc-white">{t(`games.stacker.action.${row.action}`)}</span>
              {row.keys.map((key) => (
                <Button
                  variant="bare"
                  key={key.code}
                  type="button"
                  onClick={() => vm.unbind(key.code)}
                  title={t('games.removeKey')}
                  className="rounded border border-lc-border px-1.5 py-0.5 font-mono text-[10px] text-lc-muted hover:border-red-400 hover:text-red-400"
                >
                  {key.label}
                </Button>
              ))}
              <Chip
                size="10"
                state={row.listening ? 'selected' : 'idle'}
                onClick={() => vm.listen(row.action)}
                data-testid={`bind-${row.action}`}
              >
                {t(row.listening ? 'games.stacker.pressKey' : 'games.stacker.addKey')}
              </Chip>
            </li>
          ))}
        </List>
      </div>

      <ModalFooter
        actions={[
          { label: t('games.resetKeys'), onClick: vm.reset, tone: 'secondary', testId: 'stacker-keys-reset' },
          { label: t('common.done'), onClick: onClose, tone: 'primary' },
        ]}
      />
    </Modal>
  );
}
