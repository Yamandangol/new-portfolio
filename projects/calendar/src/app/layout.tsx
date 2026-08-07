import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Personal calendar and daily planner",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Calendar",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The schedule is a fixed-height scroller; zooming it fights the drag
  // interaction, and the layout is already phone-sized.
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e13" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
