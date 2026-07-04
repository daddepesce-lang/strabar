// Canonical proprio della sessione condivisa: senza questo erediterebbe il canonical "/"
// del layout radice e Google la tratterebbe come duplicato della home.
export async function generateMetadata({ params }) {
  const { id } = await params;
  return { alternates: { canonical: `/share/${id}` } };
}

export default function ShareLayout({ children }) {
  return children;
}
