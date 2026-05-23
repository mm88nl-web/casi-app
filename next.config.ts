import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Browsers must not render this page inside a frame from a different
          // origin — prevents clickjacking. Redundant with CSP frame-ancestors
          // but retained for older browsers that don't parse CSP.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },

          // Prevents browsers from MIME-sniffing a response away from the
          // declared Content-Type, blocking drive-by content-type confusion
          // attacks on uploads served from Supabase Storage.
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // Send full URL as Referer only to same origin; send only the
          // origin when crossing origins; send nothing on downgrade to HTTP.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

          // Disable browser features that CASI never uses.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },

          {
            key: 'Content-Security-Policy',
            value: [
              // Next.js App Router injects inline chunk-loading scripts at build time.
              // 'unsafe-inline' is required for hydration — without it React never attaches
              // event handlers and all buttons are dead.  'self' still blocks external
              // <script src="..."> injection from other origins.
              // Cloudflare Turnstile (challenges.cloudflare.com) is needed for captcha on
              // free-tier submit paths.
              `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ''}`,

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
              "frame-src 'self' https://js.stripe.com https://connect.stripe.com https://challenges.cloudflare.com",

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
