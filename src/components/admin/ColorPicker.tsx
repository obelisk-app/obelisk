'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** Presets override. Defaults to a Discord-like palette. */
  presets?: string[];
  /** Popover placement relative to the trigger. */
  align?: 'left' | 'right';
  'data-testid'?: string;
}

const DEFAULT_PRESETS = [
  '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63',
  '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#607d8b',
  '#11806a', '#1f8b4c', '#206694', '#71368a', '#ad1457',
  '#c27c0e', '#a84300', '#992d22', '#979c9f', '#546e7a',
];

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

function normalizeHex(input: string): string | null {
  const m = HEX_RE.exec(input.trim());
  if (!m) return null;
  return `#${m[1].toLowerCase()}`;
}

function parseRgb(input: string): string | null {
  const nums = input.match(/\d{1,3}/g);
  if (!nums || nums.length < 3) return null;
  const [r, g, b] = nums.slice(0, 3).map((n) => parseInt(n, 10));
  if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  const hex = [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `#${hex}`;
}

export default function ColorPicker({ value, onChange, presets = DEFAULT_PRESETS, align = 'left', ...rest }: ColorPickerProps) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [invalid, setInvalid] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commitCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    const hex = normalizeHex(trimmed) ?? parseRgb(trimmed);
    if (hex) {
      onChange(hex);
      setCustomInput('');
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  };

  return (
    <div className="relative inline-block" ref={rootRef} data-testid={rest['data-testid']}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-lc-border bg-lc-black hover:border-lc-green/50 transition-colors"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span
          className="inline-block w-5 h-5 rounded-full border border-lc-border shrink-0"
          style={{ backgroundColor: value }}
        />
        <span className="font-mono text-xs text-lc-white">{value.toUpperCase()}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-lc-muted">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute top-full mt-2 z-50 w-72 rounded-xl border border-lc-border bg-lc-dark shadow-xl p-4 space-y-3 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          role="dialog"
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-lc-muted mb-2">Presets</div>
            <div className="grid grid-cols-10 gap-2">
              {presets.map((hex) => {
                const active = hex.toLowerCase() === value.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => {
                      onChange(hex);
                    }}
                    aria-label={`Choose ${hex}`}
                    className={`aspect-square w-full rounded-full border-2 transition-transform hover:scale-110 focus:outline-none ${
                      active ? 'border-lc-white ring-2 ring-lc-green/60' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
              <label
                htmlFor={inputId}
                className="aspect-square w-full rounded-full border-2 border-lc-border cursor-pointer relative overflow-hidden hover:scale-110 transition-transform"
                title="Pick any color"
                style={{
                  background:
                    'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                }}
              >
                <input
                  id={inputId}
                  type="color"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </label>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-lc-muted mb-2">Custom</div>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full border border-lc-border shrink-0"
                style={{ backgroundColor: value }}
                aria-hidden
              />
              <input
                type="text"
                value={customInput}
                onChange={(e) => { setCustomInput(e.target.value); setInvalid(false); }}
                onBlur={commitCustom}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitCustom(); }
                }}
                placeholder={`${value.toUpperCase()} or 255, 153, 0`}
                className={`flex-1 bg-lc-black border rounded-lg px-2 py-1.5 text-xs font-mono text-lc-white focus:outline-none ${
                  invalid ? 'border-red-500' : 'border-lc-border focus:border-lc-green'
                }`}
                data-testid="color-custom-input"
              />
            </div>
            {invalid && (
              <p className="text-[11px] text-red-400 mt-1">
                Enter hex like <code>#FF9900</code> or RGB like <code>255, 153, 0</code>.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
