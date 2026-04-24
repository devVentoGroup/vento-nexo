import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { VentoShell } from "../components/vento/standard/vento-shell";
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vento OS · NEXO",
  description: "Logística e inventario operativo.",
  applicationName: "Vento NEXO",
  authors: [{ name: "Vento Group" }],
  metadataBase: new URL("https://nexo.ventogroup.co"),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "NEXO",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/logos/nexo.svg",
    shortcut: "/logos/nexo.svg",
    apple: "/logos/nexo.svg",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "NEXO",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${manrope.variable} ${geistMono.variable} antialiased`}>
        <Script id="vento-number-wheel-guard" strategy="afterInteractive">
          {`(() => {
            if (window.__ventoNumberWheelGuard) return;
            window.__ventoNumberWheelGuard = true;
            document.addEventListener('wheel', (event) => {
              const target = event.target;
              if (!(target instanceof Element)) return;
              const input = target.closest('input[type="number"]');
              if (!input) return;
              if (document.activeElement === input) {
                input.blur();
                event.preventDefault();
              }
            }, { passive: false });
          })();`}
        </Script>
        <VentoShell>{children}</VentoShell>
      </body>

    </html>
  );
}

