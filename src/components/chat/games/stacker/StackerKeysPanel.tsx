'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import {
  BINDABLE, bindKey, keyLabel, keysFor, loadKeyMap, resetKeyMap, saveKeyMap, unbindKey,
  type KeyMap,
} from '@/lib/games/stacker/keymap';
import type { InputKind } from '@/lib/games/stacker/engine';
import { useTranslations } from 'next-intl';
import ModalHeader from '@/components/ui/ModalHeader';
import ModalFooter from '@/components/ui/ModalFooter';
import Chip from '@/components/ui/Chip';

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
  const [map, setMap] = useState<KeyMap>(() => loadKeyMap());
  const [listening, setListening] = useState<InputKind | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      const next = bindKey(map, e.code, listening);
      setMap(next);
      saveKeyMap(next);
      setListening(null);
    };
    // Capture, so the game's own handler does not also see this keypress.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, map]);

  return (
    <Modal
      onClose={onClose}
      testId="stacker-keys-panel"
      panelClassName="w-full max-w-sm mx-4 rounded-xl border border-lc-border bg-lc-dark shadow-xl flex flex-col overflow-hidden max-h-[85vh]"
    >
      <ModalHeader title={t('games.controls')} subtitle={t('games.controlsHelp')} onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <ul className="space-y-1.5" data-testid="stacker-key-list">
          {BINDABLE.map(({ action }) => {
            const bound = keysFor(map, action);
            return (
              <li key={action} className="flex items-center gap-2">
                <span className="flex-1 text-xs text-lc-white">{t(`games.stacker.action.${action}`)}</span>
                {bound.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      const next = unbindKey(map, code);
                      setMap(next);
                      saveKeyMap(next);
                    }}
                    title={t('games.removeKey')}
                    className="rounded border border-lc-border px-1.5 py-0.5 font-mono text-[10px] text-lc-muted hover:border-red-400 hover:text-red-400"
                  >
                    {code === 'Space' ? t('games.stacker.space') : keyLabel(code)}
                  </button>
                ))}
                <Chip
                  size="10"
                  state={listening === action ? 'selected' : 'idle'}
                  onClick={() => setListening(action)}
                  data-testid={`bind-${action}`}
                >
                  {t(listening === action ? 'games.stacker.pressKey' : 'games.stacker.addKey')}
                </Chip>
              </li>
            );
          })}
        </ul>
      </div>

      <ModalFooter
        actions={[
          { label: t('games.resetKeys'), onClick: () => setMap(resetKeyMap()), tone: 'secondary', testId: 'stacker-keys-reset' },
          { label: t('common.done'), onClick: onClose, tone: 'primary' },
        ]}
      />
    </Modal>
  );
}
