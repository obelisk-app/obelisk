/**
 * SEO: relay share links. Relays whose share link (`/r/<code>`) has its own
 * title, description and card, by relay URL. Their copy is in
 * `seo.relay.<key>`; the name is a brand, the same in every language, and
 * the logo a file under `public/`.
 */

export type RelayBrand = { key: 'laCrypta'; name: string; logoFile: string };

export const BRANDED_RELAYS: Record<string, RelayBrand> = {
  'wss://lacrypta-relay.obelisk.ar': {
    key: 'laCrypta',
    name: 'La Crypta', // i18n-exempt: a brand name
    logoFile: 'lacrypta-logo.png',
  },
};
