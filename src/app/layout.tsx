import type { Metadata } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import DevBanner from "@/components/DevBanner";

const sans = Bricolage_Grotesque({
  variable: "--font-casi-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-casi-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
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
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
            <ClientErrorReporter />
            <Suspense fallback={null}>
              <DevBanner />
            </Suspense>
            {children}
          </Providers>
      </body>
    </html>
  );
}
