import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              // Next.js App Router injects inline chunk-loading scripts at build time.
              // 'unsafe-inline' is required for hydration — without it React never attaches
              // event handlers and all buttons are dead.  'self' still blocks external
              // <script src="..."> injection from other origins.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,

              // Inline styles are used throughout (CSS string pattern).
              // Google Fonts stylesheet is loaded via @import in Header.
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

              // Fonts from Google CDN and any embedded base64 data: fonts.
              "font-src 'self' https://fonts.gstatic.com data:",

              // Images: our own origin + Supabase Storage CDN + external HTTPS
              // URLs pasted by viewers (the URL-link beam mode).
              "img-src 'self' data: blob: https:",

              // Videos: Supabase Storage CDN + external HTTPS video URLs.
              "media-src 'self' blob: https:",

              // Fetch / WebSocket: Supabase REST & Realtime, Solana RPC,
              // Helius, Stripe.
              "connect-src 'self' https: wss:",

              // Stripe Checkout is opened in a new tab (window.location.href),
              // but Stripe.js may render an iframe for some flows.
              "frame-src 'self' https://js.stripe.com https://connect.stripe.com",

              // Web Workers spun up by wallet adapters.
              "worker-src 'self' blob:",

              // Block plugins (Flash, etc.) entirely.
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
