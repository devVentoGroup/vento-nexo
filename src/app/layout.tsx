import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { VentoTopbar } from "../components/vento/vento-topbar";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen bg-[#FFF7E6] text-[#2A1A00]">
          <div className="sticky top-0 z-40 border-b border-[#F0E3C6] bg-white">
            <VentoTopbar />
          </div>

          <main className="w-full px-6 py-8">{children}</main>
        </div>
      </body>

    </html>
  );
}
