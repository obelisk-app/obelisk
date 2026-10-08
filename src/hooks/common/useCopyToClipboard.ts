'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { writeClipboardText } from '@/services/common/clipboard';

interface CopyOptions {
  /** How long the `copied` / `error` flag stays set before auto-clearing. */
  resetMs?: number;
  /** Runs after the flag clears - useful for "flash feedback, then close menu". */
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
  const request = useRef(0);
  const mounted = useRef(false);

  useEffect(() => { onResetRef.current = onReset; });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(async (text: string, key?: string): Promise<boolean> => {
    const owner = ++request.current;
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    let success = false;
    try {
      await writeClipboardText(text);
      success = true;
    } catch { /* The caller receives false, and the current request shows the error. */ }
    if (mounted.current && owner === request.current) {
      setCopied(success ? key ?? true : null);
      setError(!success);
      timer.current = setTimeout(() => {
        if (!mounted.current || owner !== request.current) return;
        timer.current = null;
        setCopied(null);
        setError(false);
        onResetRef.current?.();
      }, resetMs);
    }
    return success;
  }, [resetMs]);

  return { copied, error, copy };
}
