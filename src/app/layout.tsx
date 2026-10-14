import type { Metadata, Viewport } from "next";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "mAI Spot",
  description: "Your own radio station, cinema, gallery, arcade and library — shared directly with friends, peer to peer.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#030608",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#030608] text-slate-100 min-h-screen pb-16 md:pb-0 selection:bg-[#f9993c] selection:text-black">
        {children}
      </body>
    </html>
  );
}
