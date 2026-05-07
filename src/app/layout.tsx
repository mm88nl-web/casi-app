import type { Metadata } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import DevBanner from "@/components/DevBanner";
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
  title: "casi",
  description: "Rent a slot on your favourite streamer's screen.",
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
