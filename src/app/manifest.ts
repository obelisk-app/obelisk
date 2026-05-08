import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Keep `name` short — Android Chrome renders it under the icon on the
    // PWA splash and clips anything that doesn't fit on one line. The longer
    // marketing string lives in `description` and the page metadata.
    name: 'Obelisk',
    short_name: 'Obelisk',
    description:
      'Chat grupal estilo Discord con identidad criptográfica Nostr. Sin emails, sin contraseñas.',
    // Land directly on the chat shell when the user opens the installed
    // app — bypassing the marketing landing page is the expected mobile
    // PWA behavior. `scope: '/'` keeps in-app navigation to the landing
    // pages, guides, etc. inside the standalone window.
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait-primary',
    categories: ['social', 'communication'],
    icons: [
      // Chrome's installability check looks for explicit 192x192 and
      // 512x512 entries. Without these, manifest validation passes but
      // the address-bar install icon never appears. The `any` icons are
      // generated from /public/obelisk-favicon.png at build-prep time.
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
