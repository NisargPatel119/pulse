import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pulse',
    short_name: 'Pulse',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e1013',
    theme_color: '#0e1013',
    icons: [{ src: '/apple-icon', sizes: '180x180', type: 'image/png' }, { src: '/icon', sizes: '32x32', type: 'image/png' }],
  };
}
