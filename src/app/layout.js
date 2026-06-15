import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Strabar | Lo Strava delle Bevute",
  description: "Traccia le tue sessioni alcoliche, tagga gli amici, pianifica percorsi (Pub Crawl) ed esporta le tue performance per i social media.",
  keywords: "strabar, strava delle bevute, pub crawl, bar crawl, alcol tracker",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
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
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
