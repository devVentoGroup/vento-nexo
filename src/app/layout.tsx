import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
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
  description: "Logística e inventario operativo (LOC/LPN).",
  applicationName: "Vento OS",
  authors: [{ name: "Vento Group" }],
  metadataBase: new URL("https://nexo.ventogroup.co"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${manrope.variable} ${geistMono.variable} antialiased`}>
        <VentoShell>{children}</VentoShell>
      </body>

    </html>
  );
}
