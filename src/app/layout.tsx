import type { Metadata } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import DevBanner from "@/components/DevBanner";
import { CookieNotice } from "@/components/CookieNotice";
import { DevScreenSwitcher, DevTweaksPanel } from "@/components/v9";

// v9 type system: Bricolage Grotesque (display + body), JetBrains Mono (meta/labels),
// Instrument Serif (italic accents). Variable names keep their `--font-casi-*` shape so
// existing v7 components (`var(--font-casi-sans)` etc.) keep resolving — sans + display
// both point at Bricolage now.
const sans = Bricolage_Grotesque({
  variable: "--font-casi-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

const display = Bricolage_Grotesque({
  variable: "--font-casi-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-casi-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const serif = Instrument_Serif({
  variable: "--font-casi-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'https://casi.gg',
  ),
  title: {
    default: 'casi',
    template: '%s · casi',
  },
  description:
    'Pay-per-minute streamer overlays. Viewers pay to place clips, images, and banners on stream, by the minute or per flash. The streamer approves every one and keeps 100%. Apache 2.0 escrow on Solana.',
  keywords: [
    'streaming',
    'tipping',
    'Solana',
    'crypto',
    'streamer tools',
    'USDC',
    'escrow',
    'OBS',
    'time-vested',
    'open source',
  ],
  authors: [{ name: 'Matthew Melendez' }],
  creator: 'Matthew Melendez',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://casi.gg',
    siteName: 'casi',
    title: 'casi — Your stream is real estate. Lease it.',
    description:
      'Pay-per-minute streamer overlays. 0% casi cut. Apache 2.0 escrow on Solana.',
    // Next.js auto-wires src/app/opengraph-image.tsx — no images array needed.
  },
  twitter: {
    card: 'summary_large_image',
    title: 'casi — Your stream is real estate. Lease it.',
    description:
      'Pay-per-minute streamer overlays. 0% casi cut. Apache 2.0 escrow on Solana.',
  },
  // Explicit icon metadata so wallet popups (Phantom/Solflare/etc.) reliably
  // pick up the filled-square brand mark instead of falling back to a default
  // glyph when the auto-detected SVG renders thin against their dark theme.
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
            <ClientErrorReporter />
            <Suspense fallback={null}>
              <DevBanner />
            </Suspense>
            {children}
            {/* UI chrome below: anything that renders here leaks onto OBS
                browser-source routes (/overlay, /obs) unless it gates itself
                via `useIsOverlayRoute()` from `@/lib/use-is-overlay-route`.
                See CookieNotice for the pattern. */}
            <CookieNotice />
            {/* v9 dev tools — render only in non-production builds (gated inside each
                component). Mounted at the root so they appear on every page during
                the v9 port. */}
            <DevScreenSwitcher />
            <DevTweaksPanel />
          </Providers>
      </body>
    </html>
  );
}
