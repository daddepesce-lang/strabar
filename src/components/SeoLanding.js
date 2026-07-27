// Componente PRESENTAZIONALE per le landing SEO (server component: niente 'use client',
// niente stato, niente fetch → HTML statico, indicizzabile e a costo egress ZERO).
// Riceve contenuti già pronti (una lingua per pagina) e li impagina nel tema scuro
// del brand. Include un blocco JSON-LD (dati strutturati) per i rich result di Google.
import Link from 'next/link';

const wrap = { maxWidth: 860, margin: '0 auto', padding: '0 4px' };

export default function SeoLanding({
  eyebrow,
  h1,
  lead,
  ctas = [],
  sections = [],
  steps = null,
  stepsTitle = null,
  faq = [],
  faqTitle = 'FAQ',
  finalCta = null,
  related = [],
  relatedTitle = null,
  jsonLd = null,
}) {
  return (
    <article style={wrap}>
      {jsonLd && (
        <script
          type="application/ld+json"
          // JSON-LD è dato strutturato, non contenuto utente: safe.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      {/* HERO */}
      <header style={{ padding: '18px 0 8px' }}>
        {eyebrow && (
          <span style={{
            display: 'inline-block', fontSize: 12, fontWeight: 800, letterSpacing: '.14em',
            textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 10,
          }}>{eyebrow}</span>
        )}
        <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)', fontWeight: 800, lineHeight: 1.08, margin: 0 }}>
          {h1}
        </h1>
        {lead && (
          <p style={{ fontSize: 'clamp(16px, 2.4vw, 19px)', color: 'var(--text-dark-secondary)', lineHeight: 1.55, marginTop: 16 }}>
            {lead}
          </p>
        )}
        {ctas.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 22 }}>
            {ctas.map((c, i) => (
              <Link
                key={i}
                href={c.href}
                className={`btn ${c.primary ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 999, padding: '12px 22px', fontSize: 15, fontWeight: 700 }}
              >
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* SEZIONI DI CONTENUTO */}
      {sections.map((s, i) => (
        <section key={i} id={s.id} style={{ marginTop: 36 }}>
          {s.h2 && <h2 style={{ fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 800, margin: '0 0 12px' }}>{s.h2}</h2>}
          {(s.paragraphs || []).map((p, pi) => (
            <p key={pi} style={{ fontSize: 16, color: 'var(--text-dark-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>{p}</p>
          ))}
          {s.list && (
            <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {s.list.map((li, li2) => (
                <li key={li2} style={{ display: 'flex', gap: 10, fontSize: 16, color: 'var(--text-dark-secondary)', lineHeight: 1.6 }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 900, flexShrink: 0 }}>›</span>
                  <span><strong style={{ color: 'var(--text-dark-primary)' }}>{li.t}</strong>{li.d ? ` — ${li.d}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {/* PASSI (come funziona) */}
      {steps && steps.length > 0 && (
        <section style={{ marginTop: 40 }}>
          {stepsTitle && <h2 style={{ fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 800, margin: '0 0 18px' }}>{stepsTitle}</h2>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {steps.map((st, i) => (
              <div key={i} className="card" style={{ padding: 18 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', background: 'var(--primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, marginBottom: 10,
                }}>{i + 1}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>{st.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-dark-secondary)', lineHeight: 1.55, margin: 0 }}>{st.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <section style={{ marginTop: 44 }}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 800, margin: '0 0 16px' }}>{faqTitle}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {faq.map((f, i) => (
              <details key={i} className="card" style={{ padding: '14px 16px' }}>
                <summary style={{ fontSize: 16, fontWeight: 700, cursor: 'pointer', color: 'var(--text-dark-primary)' }}>{f.q}</summary>
                <p style={{ fontSize: 15, color: 'var(--text-dark-secondary)', lineHeight: 1.65, margin: '10px 0 0' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* CTA FINALE */}
      {finalCta && (
        <section style={{ marginTop: 46 }}>
          <div className="card" style={{
            padding: 28, textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(255,59,47,0.14), rgba(255,59,47,0.04))',
            border: '1px solid rgba(255,59,47,0.35)',
          }}>
            <h2 style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 800, margin: '0 0 10px' }}>{finalCta.title}</h2>
            {finalCta.sub && <p style={{ fontSize: 16, color: 'var(--text-dark-secondary)', lineHeight: 1.6, margin: '0 auto 20px', maxWidth: 560 }}>{finalCta.sub}</p>}
            <Link href={finalCta.button.href} className="btn btn-primary" style={{ borderRadius: 999, padding: '13px 28px', fontSize: 16, fontWeight: 800 }}>
              {finalCta.button.label}
            </Link>
          </div>
        </section>
      )}

      {/* LINK CORRELATI (internal linking per il crawl) */}
      {related.length > 0 && (
        <nav style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border-dark)' }}>
          {relatedTitle && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dark-secondary)', marginBottom: 10 }}>{relatedTitle}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {related.map((r, i) => (
              <Link key={i} href={r.href} style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600 }}>{r.label}</Link>
            ))}
          </div>
        </nav>
      )}
    </article>
  );
}
