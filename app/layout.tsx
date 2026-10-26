import type { Metadata, Viewport } from "next";
import { IM_Fell_English, Literata } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import "./globals.css";

const display = IM_Fell_English({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });
const body = Literata({ subsets: ["latin", "cyrillic"], weight: ["400", "600"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Anyone there?",
  description: "A spirit box made of Whisper. It runs the open speech model on your own device with its ghost filters off, and listens to an empty room.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#0d0b10", width: "device-width", initialScale: 1, colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="top">
          <Link className="brand" href="/">
            <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
              <path d="M16 3c4 5 6 8 6 12a6 6 0 0 1-12 0c0-4 2-7 6-12z" fill="var(--marigold)" />
              <path d="M16 11c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z" fill="var(--flame-core)" />
              <rect x="12" y="22" width="8" height="8" rx="1" fill="currentColor" />
            </svg>
            Anyone there?
          </Link>
          <nav>
            <Link href="/register">The register</Link>
          </nav>
        </header>
        {children}
        <footer className="foot">
          <p>
            Whisper base (open weights, MIT) running on your device with Transformers.js and ONNX Runtime. Nothing you record leaves this page.{" "}
            <a href="https://github.com/abjt01/anyone-there">Source</a>
          </p>
        </footer>
        <Script id="sw" strategy="afterInteractive">{`if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});`}</Script>
      </body>
    </html>
  );
}
