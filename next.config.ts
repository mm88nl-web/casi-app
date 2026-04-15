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
              // Only load scripts from our own origin.
              // 'unsafe-eval' is added in dev for Next.js HMR — never in prod.
              `script-src 'self'${isDev ? " 'unsafe-eval'" : ''}`,

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
              // Streamflow, Helius, Stripe.
              "connect-src 'self' https: wss:",

              // Stripe Checkout is opened in a new tab (window.location.href),
              // but Stripe.js may render an iframe for some flows.
              "frame-src 'self' https://js.stripe.com https://connect.stripe.com",

              // Web Workers spun up by wallet adapters / Streamflow.
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
