import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Obelisk — Chat grupal con identidad Nostr',
    short_name: 'Obelisk',
    description:
      'Chat grupal estilo Discord con identidad criptográfica Nostr. Sin emails, sin contraseñas.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#b4f953',
    orientation: 'portrait-primary',
    categories: ['social', 'communication'],
    icons: [
      {
        src: '/obelisk.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/obelisk.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
