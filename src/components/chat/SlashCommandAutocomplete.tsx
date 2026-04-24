'use client';

import { useEffect, useRef } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';

export interface SlashCommand {
  name: string;
  description: string;
}

interface Props {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

// Dropdown that mirrors MentionAutocomplete / EmojiAutocomplete so
// MessageInput can reuse its keyboard model.
export default function SlashCommandAutocomplete({ commands, selectedIndex, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useClickOutside(ref, onClose);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (commands.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute left-4 right-4 bottom-full mb-1 z-50 bg-lc-dark border border-lc-border rounded-xl shadow-lg max-h-48 overflow-y-auto"
      data-testid="slash-autocomplete"
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-lc-muted border-b border-lc-border">
        Comandos
      </div>
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          ref={(el) => { itemRefs.current[i] = el; }}
          onClick={() => onSelect(cmd)}
          className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
            i === selectedIndex ? 'bg-lc-border/60' : 'hover:bg-lc-border/40'
          }`}
          data-testid="slash-option"
        >
          <span className="font-mono text-sm text-lc-green">/{cmd.name}</span>
          <span className="text-xs text-lc-muted truncate">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'jugar', description: 'Abrir la lista de juegos disponibles' },
  { name: 'zap', description: 'Enviar un zap Lightning a otro usuario' },
  { name: 'invoice', description: 'Crear una factura Lightning pública en el canal' },
  { name: 'balance', description: 'Ver tu balance de Lightning (solo vos)' },
];
