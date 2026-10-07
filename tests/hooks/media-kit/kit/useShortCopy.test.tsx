import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import { useShortCopy } from '@/hooks/media-kit/kit/useShortCopy';
import { LINKS, SHORT_COPY } from '@/constants/media-kit/content';

function English({ children }: { children: ReactNode }) {
  return <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
}

function Spanish({ children }: { children: ReactNode }) {
  return <LocaleProvider initialLocale="es">{children}</LocaleProvider>;
}

describe('useShortCopy', () => {
  it('keeps every phrase, in order, with its label', () => {
    const { result } = renderHook(() => useShortCopy(), { wrapper: English });
    expect(result.current.map((item) => item.labelKey)).toEqual(SHORT_COPY.map((item) => item.labelKey));
  });

  it('writes the brand lines in the page language and the links as they are', () => {
    const { result } = renderHook(() => useShortCopy(), { wrapper: Spanish });
    const byLabel = Object.fromEntries(result.current.map((item) => [item.labelKey, item.value]));
    expect(byLabel['mediaKit.shortCopyLabel.tagline']).toBe(translator('es')('mediaKit.brand.tagline'));
    expect(byLabel['mediaKit.shortCopyLabel.github']).toBe(LINKS.github);
  });
});
