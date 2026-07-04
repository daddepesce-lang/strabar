// Canonical proprio della pagina Premium: pagina pubblica indicizzabile, NON un duplicato
// della home (altrimenti erediterebbe il canonical "/" dal layout radice).
export const metadata = {
  title: 'Strabar Premium',
  alternates: { canonical: '/premium' },
};

export default function PremiumLayout({ children }) {
  return children;
}
