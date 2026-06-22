import "./globals.css";
import Navbar from "@/components/Navbar";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import PushReminderGate from "@/components/PushReminderGate";
import Footer from "@/components/Footer";
import AgeGate from "@/components/AgeGate";
import OnboardingGate from "@/components/OnboardingGate";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Strabar | Il Social Network degli Atleti da Bar",
  description: "Traccia le tue sessioni alcoliche, tagga gli amici, pianifica percorsi (Pub Crawl) ed esporta le tue performance per i social media.",
  keywords: "strabar, atleti da bar, pub crawl, bar crawl, alcol tracker, social drinking",
  applicationName: "Strabar",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Strabar",
  },
  formatDetection: { telephone: false },
  icons: {
    // Favicon + icona app: salva i PNG quadrati in public/ (icon-192/512, apple-touch-icon).
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
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
    <html lang="it" suppressHydrationWarning>
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
        <PwaInstallBanner />
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
