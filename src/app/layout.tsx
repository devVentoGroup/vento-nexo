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
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logos/nexo.svg", type: "image/svg+xml" },
      { url: "/icons/nexo-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/nexo-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
        <Script id="vento-submit-guard" strategy="afterInteractive">
          {`(() => {
            if (window.__ventoSubmitGuard) return;
            window.__ventoSubmitGuard = true;

            const pendingTextByButton = new WeakMap();

            document.addEventListener('submit', (event) => {
              const form = event.target;
              if (!(form instanceof HTMLFormElement)) return;
              if (form.dataset.submitGuard === 'off') return;
              if (!form.checkValidity()) return;

              if (form.dataset.submitting === 'true') {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
              }

              form.dataset.submitting = 'true';
              const buttons = [
                ...form.querySelectorAll('button[type="submit"], button:not([type])'),
                ...(form.id ? document.querySelectorAll('button[form="' + CSS.escape(form.id) + '"]') : []),
              ];
              for (const button of buttons) {
                if (!(button instanceof HTMLButtonElement)) continue;
                pendingTextByButton.set(button, button.textContent || '');
                button.disabled = true;
                button.setAttribute('aria-disabled', 'true');
                const pendingLabel = button.dataset.pendingLabel || 'Guardando...';
                if (button.dataset.pendingLabel !== 'off') button.textContent = pendingLabel;
              }
            }, true);

            window.addEventListener('pageshow', () => {
              for (const form of document.querySelectorAll('form[data-submitting="true"]')) {
                form.dataset.submitting = 'false';
                const buttons = [
                  ...form.querySelectorAll('button[type="submit"], button:not([type])'),
                  ...(form.id ? document.querySelectorAll('button[form="' + CSS.escape(form.id) + '"]') : []),
                ];
                for (const button of buttons) {
                  if (!(button instanceof HTMLButtonElement)) continue;
                  button.disabled = false;
                  button.removeAttribute('aria-disabled');
                  const previousText = pendingTextByButton.get(button);
                  if (previousText) button.textContent = previousText;
                }
              }
            });
          })();`}
        </Script>
        <VentoShell>{children}</VentoShell>
      </body>

    </html>
  );
}

