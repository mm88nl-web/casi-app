import type { MetadataRoute } from 'next';

/**
 * Web app manifest.
 *
 * Primarily here for dApp identity in wallet prompts, not for PWA install.
 * Solana wallet extensions (Solflare, Phantom) render the requesting site's
 * name + icon on every connect and signature prompt; several of them read
 * this manifest, and the ones that don't fall back to `/favicon.ico` or the
 * `apple-icon` — which is why `src/app/` carries a raster icon set alongside
 * `icon.svg`. An SVG-only setup is what produced the generic globe
 * placeholder in Solflare.
 *
 * `name` is deliberately just "casi", not the full `<title>` marketing line
 * ("casi — viewers pay to appear on your live stream"). A signature prompt is
 * a trust surface: a short name that matches the domain reads as identity,
 * a sentence reads as a banner. The page <title> in layout.tsx is unchanged,
 * so SEO is unaffected.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'casi',
    short_name: 'casi',
    description:
      'Viewers pay to appear on your live stream. The streamer approves every one and keeps 100%.',
    start_url: '/',
    display: 'standalone',
    // Matches the icon field's black rounded-square treatment (see icon.svg)
    // and the v9 paper token, so the splash/install chrome doesn't flash a
    // colour that appears nowhere else in the brand.
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
