'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface CopyOptions {
  /** How long the `copied` / `error` flag stays set before auto-clearing. */
  resetMs?: number;
  /** Runs after the flag clears — useful for "flash feedback, then close menu". */
  onReset?: () => void;
}

/**
 * Clipboard write paired with a short-lived "copied" / "error" flag for UI
 * feedback. Covers the variants found across the app:
 *   - Boolean flag:      copy(text);           then  {copied && <CheckIcon />}
 *   - Per-row key:       copy(text, row.id);   then  {copied === row.id && <CheckIcon />}
 *   - Label swap:        {error ? 'Error' : copied ? 'Copied' : 'Copy'}
 *   - Flash-then-close:  useCopyToClipboard({ onReset: () => setMenuOpen(false) })
 *
 * `copy()` resolves to `true` on success, `false` if the browser rejected.
 */
export function useCopyToClipboard(options: number | CopyOptions = {}) {
  const { resetMs = 2000, onReset } = typeof options === 'number' ? { resetMs: options } : options;
  const [copied, setCopied] = useState<true | string | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResetRef = useRef(onReset);

  useEffect(() => { onResetRef.current = onReset; });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const scheduleReset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(null);
      setError(false);
      onResetRef.current?.();
    }, resetMs);
  }, [resetMs]);

  const copy = useCallback(async (text: string, key?: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError(true);
      setCopied(null);
      scheduleReset();
      return false;
    }
    setCopied(key ?? true);
    setError(false);
    scheduleReset();
    return true;
  }, [scheduleReset]);

  return { copied, error, copy };
}
