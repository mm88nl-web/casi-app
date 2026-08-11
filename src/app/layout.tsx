import type { Metadata, Viewport } from "next";
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

// Casi Light is the only scheme — pin the browser to light so mobile dark-mode
// devices never paint a dark canvas/chrome before our CSS applies (no dark flash).
export const viewport: Viewport = {
  themeColor: "#f5e1d2",
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'https://casi.gg',
  ),
  title: {
    default: 'casi — viewers pay to appear on your live stream',
    template: '%s · casi',
  },
  description:
    'Pay-per-minute streamer overlays. Viewers pay to place clips, images, and banners on stream, by the minute or per flash. The streamer approves every one and keeps 100%. Apache 2.0 escrow on Solana.',
  alternates: { canonical: '/' },
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
  authors: [{ name: 'casi' }],
  creator: 'casi',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.casi.gg',
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

// Site-wide structured data: who casi is, the site itself, and the product.
// Helps rich results and makes casi citable by AI search engines.
const SITE_JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://www.casi.gg/#org',
      name: 'casi',
      url: 'https://www.casi.gg',
      logo: 'https://www.casi.gg/icon.svg',
      sameAs: ['https://github.com/mm88nl-web/casi-app'],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://www.casi.gg/#website',
      name: 'casi',
      url: 'https://www.casi.gg',
      publisher: { '@id': 'https://www.casi.gg/#org' },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'casi',
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web',
      description:
        'Pay-per-minute streamer overlays. Viewers pay to place clips, images, and banners on a live stream, by the minute or per flash. The streamer approves every one and keeps 100%. Open-source, time-vested USDC escrow on Solana.',
      url: 'https://www.casi.gg',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': 'https://www.casi.gg/#org' },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-paper="light"
      className={`${sans.variable} ${display.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      {/* Anti-FOUC: apply the stored skin before first paint, synchronously,
          so a returning visitor with a non-default skin (e.g. the flagship
          Casi Dark teal) never sees the Casi Light :root default flash
          before UserSkinProvider's effect runs post-mount. Reinstates
          26643fc, which 2026-06-02's e1d1c01 ("kill teal flash on nav")
          deleted outright instead of just fixing the new-visitor case it
          was actually chasing -- that regressed this exact flash for every
          returning visitor on a non-default skin. globals.css's :root
          already matches casi-light now (that part of e1d1c01 was correct
          and stays), so this script is a genuine no-op for a first-time
          visitor and only does real work for someone with a stored
          preference. Mirrors UserSkinProvider.tsx's applySkinToRoot()
          exactly, including custom-skin overrides and the data-paper
          light/dark toggle -- <html> above hardcodes data-paper="light" as
          the SSR/no-JS fallback, so a dark-skin visitor needs that
          attribute actively removed here, not just left unset, or the
          color-mix derivations stay on the light formula despite correct
          raw ink/paper values. Keep this table in sync with SKINS in
          src/lib/skins.ts by hand -- it can't import that module (this
          runs before any JS bundle loads). */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{
function h2rgb(h){h=h.replace('#','');if(h.length!==6)return null;return parseInt(h.slice(0,2),16)+', '+parseInt(h.slice(2,4),16)+', '+parseInt(h.slice(4,6),16);}
function isLightHex(h){h=h.replace('#','');if(h.length!==6)return false;var r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255;return (0.2126*r+0.7152*g+0.0722*b)>0.5;}
var S={
'casi-light':['#294b3c','41, 75, 60','#f5e1d2','#c04830','192, 72, 48',1],
'rose':['#BE185D','190, 24, 93','#FDF2F8','#9333EA','147, 51, 234',1],
'snow':['#2563EB','37, 99, 235','#F0F5FF','#7C3AED','124, 58, 237',1],
'amber':['#B45309','180, 83, 9','#FFFBEB','#DC2626','220, 38, 38',1],
'youtube':['#FF0000','255, 0, 0','#FFF8F8','#CC0000','204, 0, 0',1],
'casi-dark':['#0DCFB0','13, 207, 176','#0C0D11','#9945FF','153, 69, 255',0],
'twitch':['#9146FF','145, 70, 255','#0e0e1a','#772CE8','119, 44, 232',0],
'kick':['#53FC18','83, 252, 24','#0a1a0a','#00cc00','0, 204, 0',0],
'mono':['#E8E8E8','232, 232, 232','#0a0a0a','#888888','136, 136, 136',0],
'apothecary':['#C8A45C','200, 164, 92','#0F0C07','#7C5C2A','124, 92, 42',0],
'onlyfans':['#00AFF0','0, 175, 240','#0A1420','#0088CC','0, 136, 204',0],
'custom':['#FFFFFF','255, 255, 255','#0A0A0A','#888888','136, 136, 136',0]
};
var id=localStorage.getItem('casi-skin-id')||'casi-light';
var sk=S[id]||S['casi-light'];
var isCustom=(id==='custom');
var validHex=function(s){return !!s&&/^#[0-9A-Fa-f]{6}$/.test(s);};
var inkOv=isCustom?(localStorage.getItem('casi-ink-color')||localStorage.getItem('casi-theme-color')):null;
var paperOv=isCustom?localStorage.getItem('casi-paper-color'):null;
var accent2Ov=isCustom?localStorage.getItem('casi-accent2-color'):null;
var useInk=validHex(inkOv), usePaper=validHex(paperOv), useAccent2=validHex(accent2Ov);
var ink=useInk?inkOv:sk[0];
var inkRgb=useInk?h2rgb(inkOv):sk[1];
var paper=usePaper?paperOv:sk[2];
var accent2=useAccent2?accent2Ov:sk[3];
var accent2Rgb=useAccent2?h2rgb(accent2Ov):sk[4];
var lightMode=(sk[5]===1)||(usePaper&&isLightHex(paper));
var r=document.documentElement;
r.style.setProperty('--ink',ink);
r.style.setProperty('--paper',paper);
if(lightMode){r.setAttribute('data-paper','light');}else{r.removeAttribute('data-paper');}
r.style.setProperty('--casi-accent',ink);
r.style.setProperty('--casi-accent-rgb',inkRgb);
r.style.setProperty('--casi-accent2',accent2);
r.style.setProperty('--casi-accent2-rgb',accent2Rgb);
r.style.setProperty('--casi-bg',paper);
}catch(e){}})();` }} />
      </head>
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSONLD) }}
        />
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
