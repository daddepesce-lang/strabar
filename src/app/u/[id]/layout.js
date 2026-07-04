// Canonical proprio del profilo pubblico: evita che erediti il canonical "/" della home.
export async function generateMetadata({ params }) {
  const { id } = await params;
  return { alternates: { canonical: `/u/${id}` } };
}

export default function ProfileLayout({ children }) {
  return children;
}
