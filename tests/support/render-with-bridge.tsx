/**
 * Render under a real `<BridgeProvider>` holding a fake instance (see
 * `fake-bridge.ts`), inside the locale provider every component needs. No
 * module mock: the component's own hooks run against the fake. The provider
 * unregisters the fake when Testing Library unmounts after each test.
 */
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import type { Locale } from '@/i18n/index';
import { BridgeProvider, type BridgeImpl } from '@/services/nostr-bridge';

export interface BridgeRenderOptions {
  locale?: Locale;
  /** What `useBridgeReady()` reports. Default `true`. */
  ready?: boolean;
}

/** A `wrapper` for `render` / `renderHook`. */
export function bridgeWrapper(bridge: BridgeImpl, opts: BridgeRenderOptions = {}) {
  return function BridgeTestWrapper({ children }: { children: ReactNode }) {
    return (
      <LocaleProvider initialLocale={opts.locale ?? 'en'}>
        <BridgeProvider bridge={bridge} ready={opts.ready}>{children}</BridgeProvider>
      </LocaleProvider>
    );
  };
}

export function renderWithBridge(
  ui: ReactElement,
  bridge: BridgeImpl,
  opts: BridgeRenderOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { locale, ready, ...rest } = opts;
  return render(ui, { ...rest, wrapper: bridgeWrapper(bridge, { locale, ready }) });
}
