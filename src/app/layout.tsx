import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Toaster from "@/components/toast";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#070a11",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "Tournamax — White-label tournament apps",
  description:
    "Get a tournament app with your own name, logo and configuration. Two ready APKs, prepared by hand and delivered to your dashboard.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-snow antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
