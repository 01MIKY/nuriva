import type { MetadataRoute } from 'next';

/** Makes the client app installable on phones (PWA, roadmap decision D3). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NURIVA',
    short_name: 'NURIVA',
    description: 'Care you can trust · Cuidado en el que puedes confiar',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F2EC',
    theme_color: '#172A43',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
