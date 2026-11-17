import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_LOCALE, SITE_LOCALITY, SITE_COUNTRY, SITE_COUNTRY_CODE, SITE_REGION_CODE } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The deployment is a single-page app under one URL: crawlers receive the full
// default dataset server-side, and the client keeps per-route metadata in sync
// (src/lib/client/seo.ts).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Non-Custodial Treasury & Payment Operations on Solana | Dubai UAE`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  authors: [{ name: "AI Azimara", url: SITE_URL }],
  publisher: "AI Azimara",
  applicationName: SITE_NAME,
  category: "finance",
  // The company operates from Dubai, UAE (geo-targeting for regional search).
  other: {
    "geo.region": SITE_REGION_CODE,
    "geo.placename": SITE_LOCALITY,
    "geo.position": "25.2048;55.2708", // Dubai coordinates
    ICBM: "25.2048, 55.2708",
  },
  alternates: {
    canonical: "/",
    languages: { "en-AE": "/", en: "/" },
    types: { "text/plain": "/llms.txt" },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    url: SITE_URL,
    title: `${SITE_NAME} — Non-Custodial Treasury & Payment Operations on Solana`,
    description: SITE_DESCRIPTION,
    countryName: SITE_COUNTRY,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "AZIMARA RELAY — non-custodial treasury and payment operations on Solana, Dubai UAE",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Non-Custodial Treasury & Payment Operations on Solana`,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "32x32" }, { url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0C0A12",
  colorScheme: "dark",
};

// Server-rendered entity structured data — visible to crawlers without JS.
const organizationLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "AI Azimara",
      url: SITE_URL,
      description:
        "AI Azimara builds financial operations infrastructure from Dubai, United Arab Emirates. Its first commercial product is AZIMARA RELAY, a non-custodial treasury and payment operations platform on Solana.",
      address: {
        "@type": "PostalAddress",
        addressLocality: SITE_LOCALITY,
        addressCountry: SITE_COUNTRY_CODE,
      },
      areaServed: [
        { "@type": "Country", name: "United Arab Emirates" },
        { "@type": "AdministrativeArea", name: "GCC" },
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en-AE",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      applicationCategory: "FinanceApplication",
      applicationSubCategory: "Treasury management",
      operatingSystem: "Web",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#org` },
      offers: [
        { "@type": "Offer", name: "Starter", price: "49", priceCurrency: "USD" },
        { "@type": "Offer", name: "Growth", price: "199", priceCurrency: "USD" },
        { "@type": "Offer", name: "Business", price: "499", priceCurrency: "USD" },
      ],
      featureList: [
        "Non-custodial treasury operations",
        "Approval policies bound to payment payload hashes",
        "Batch payouts with per-item error isolation",
        "Scheduled and recurring payments",
        "Reconciliation with provider and onchain evidence",
        "AI-assisted operations without signing authority",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AE" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
        <script
          type="application/ld+json"
          // Structured data is static and first-party — dangerouslySetInnerHTML
          // with a JSON.stringify payload is the standard, safe pattern here.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
      </body>
    </html>
  );
}
