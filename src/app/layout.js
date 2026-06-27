import { Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

// Self-hosting dei font (niente richieste a Google a runtime, zero layout shift).
// Bebas Neue = font "display" del brand; DM Sans = corpo del testo.
const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import LegacyMigrationBanner from "@/components/LegacyMigrationBanner";
import PushReminderGate from "@/components/PushReminderGate";
import Footer from "@/components/Footer";
import AgeGate from "@/components/AgeGate";
import OnboardingGate from "@/components/OnboardingGate";
import WelcomeGuide from "@/components/WelcomeGuide";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  // Dominio canonico: le anteprime dei link condivisi (OG) si risolvono su strabar.app.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://strabar.app"),
  title: "Strabar | Il Social Network degli Atleti da Bar",
  description: "Traccia le tue sessioni alcoliche, tagga gli amici, pianifica percorsi (Pub Crawl) ed esporta le tue performance per i social media.",
  keywords: "strabar, atleti da bar, pub crawl, bar crawl, alcol tracker, social drinking",
  applicationName: "Strabar",
  openGraph: {
    title: "Strabar | Il Social Network degli Atleti da Bar",
    description: "Traccia le tue bevute, tagga gli amici e sfidali nelle classifiche dei locali. 🍻",
    url: "/",
    siteName: "Strabar",
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
    locale: "it_IT",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Strabar",
  },
  formatDetection: { telephone: false },
  icons: {
    // Favicon Google = /favicon.ico (vero ICO multi-size in public/). I PNG quadrati
    // (veri PNG, non più JPEG rinominati) servono per PWA/Apple/anteprime social.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // niente pinch-zoom: si comporta come un'app nativa
  viewportFit: "cover",
  themeColor: "#0D0D0D",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it" className={`${bebasNeue.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        {/* Leaflet CSS per le mappe interattive */}
        <link 
          rel="stylesheet" 
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body>
        <ServiceWorkerRegister />
        <AgeGate />
        <OnboardingGate />
        <WelcomeGuide />
        <PwaInstallBanner />
        <LegacyMigrationBanner />
        <PushReminderGate />
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            {children}
          </main>
          <Footer />
        </div>
        <Analytics />
      </body>
    </html>
  );
}
