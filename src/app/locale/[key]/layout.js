// Canonical proprio della pagina locale: evita che erediti il canonical "/" della home.
export async function generateMetadata({ params }) {
  const { key } = await params;
  return { alternates: { canonical: `/locale/${key}` } };
}

export default function VenueLayout({ children }) {
  return children;
}
