import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Toaster from "@/components/toast";
import { SEO_KEYWORDS, SEO_TITLE, SEO_DESCRIPTION } from "@/lib/seo-keywords";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#070a11",
  colorScheme: "dark",
};

const baseUrl = (process.env.APP_BASE_URL ?? "https://tournamax.toolsnetwork.online").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: SEO_TITLE,
    template: "%s | Tournamax",
  },
  description: SEO_DESCRIPTION,
  keywords: SEO_KEYWORDS,
  applicationName: "Tournamax",
  authors: [{ name: "Tournamax Team", url: baseUrl }],
  creator: "Tournamax",
  publisher: "Tournamax",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: baseUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "Tournamax",
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    images: [
      {
        url: `${baseUrl}/logo.png`,
        width: 1200,
        height: 630,
        alt: "Tournamax — #1 Free Tournament App & White-Label Esports Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    images: [`${baseUrl}/logo.png`],
    creator: "@tournamax",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${baseUrl}#organization`,
      name: "Tournamax",
      url: baseUrl,
      logo: `${baseUrl}/logo.png`,
      description: SEO_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${baseUrl}#website`,
      url: baseUrl,
      name: "Tournamax",
      description: SEO_DESCRIPTION,
      publisher: {
        "@id": `${baseUrl}#organization`,
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${baseUrl}#software`,
      name: "Tournamax Tournament App",
      operatingSystem: "Android",
      applicationCategory: "GameApplication",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
      },
      description: SEO_DESCRIPTION,
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        reviewCount: "1280",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="bg-ink text-snow antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
