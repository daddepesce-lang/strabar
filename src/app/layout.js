import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Strabar | Il Social Network degli Atleti da Bar",
  description: "Traccia le tue sessioni alcoliche, tagga gli amici, pianifica percorsi (Pub Crawl) ed esporta le tue performance per i social media.",
  keywords: "strabar, atleti da bar, pub crawl, bar crawl, alcol tracker, social drinking",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
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
