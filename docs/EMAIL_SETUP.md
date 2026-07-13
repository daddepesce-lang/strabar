# Email su strabar.app — setup consigliato

Due esigenze diverse, non confonderle:

| Serve per | Prodotto | Chi lo fa |
|---|---|---|
| **Inviare** email automatiche dell'app + broadcast opt-in | API di sending | **Resend** (già in uso) |
| **Caselle vere** (`bizdev@`, `marketing@` che una persona apre e legge) | Email **hosting** | provider di caselle (sotto) |

⚠️ Vercel gestisce solo il **dominio/DNS**, non ospita caselle. I record MX vanno aggiunti nei DNS di `strabar.app` (pannello Vercel → Domains → DNS).

---

## Caselle: opzioni

| Opzione | Costo | Note |
|---|---|---|
| **Zoho Mail (Forever Free)** ⭐ | **€0** | Caselle **vere** gratuite: fino a 5 utenti, 5GB/utente, 1 dominio. Registrati come **Business** ("own domain"). Limite free: accesso solo da webmail/app Zoho (IMAP/Outlook è a pagamento). |
| **iCloud+ Custom Email Domain** | ~€0,99/mese | Caselle vere send+receive, zero attrito su Mac (Apple Mail/Outlook). |
| **Cloudflare Routing / ImprovMX** (+ Gmail send-as + Brevo) | €0 | Solo inoltro + send-as: più fiddly. Fallback se Zoho non va. |
| **Google Workspace** | ~€6/utente/mese | Quando l'outreach diventa serio: deliverability top. |

**Consigliato ora: Zoho Mail Forever Free** — caselle vere a costo zero.

### Zoho — passi
1. Registrazione Zoho Mail → **Business Email** → **"Sign up with a domain I already own"** → `strabar.app`.
2. Scegli il piano **Forever Free** (in fondo alla lista piani).
3. **Verifica dominio**: incolla il TXT/CNAME di Zoho in **Vercel → Domains → strabar.app → DNS**.
4. Aggiungi i **MX** di Zoho + **SPF** + **DKIM** (sempre in Vercel DNS).
5. Crea gli utenti `bizdev@strabar.app`, `marketing@strabar.app`.
6. Convivenza con Resend: Zoho tiene le MX (ricezione), Resend invia da `send.strabar.app` (SPF/DKIM su sottodominio) → nessun conflitto.

### iCloud+ — passi
1. iPhone/Mac → Impostazioni → il tuo nome → iCloud → **iCloud+ → Dominio email personalizzato** → aggiungi `strabar.app`.
2. Apple mostra i record **MX / SPF (TXT) / DKIM (TXT) / DMARC (TXT)**.
3. Incollali in **Vercel → Domains → strabar.app → DNS** (Type/Name/Value come indicati da Apple).
4. Crea gli indirizzi: `bizdev@strabar.app`, `marketing@strabar.app`.

### Cloudflare Email Routing — passi (alternativa gratis)
1. Sposta i nameserver di `strabar.app` su Cloudflare (guida in‑app di Cloudflare; il sito resta su Vercel via record A/CNAME).
2. Cloudflare → **Email → Email Routing** → aggiunge in automatico gli MX.
3. Crea regola: `marketing@strabar.app` → inoltra alla tua Gmail. Idem `bizdev@`.
4. Per **rispondere** come `@strabar.app`: Gmail → Impostazioni → Account → "Invia messaggi come" con un relay SMTP (es. Brevo free 300/giorno).

---

## Sending (app + marketing) con Resend

- Tieni **Resend** per le email transazionali dell'app.
- Usa un **sottodominio dedicato** per il MAIL FROM, es. `send.strabar.app`: convive senza conflitti con le MX delle caselle (DKIM su selettori diversi, un solo record SPF con più `include:`).
- Record Resend (dal dashboard Resend → Domains → aggiungi `send.strabar.app`): 1 MX (per il bounce), 1 TXT SPF, 2–3 CNAME DKIM. Incollali in Vercel DNS.
- **Free tier Resend:** 100 email/giorno, 3.000/mese, 1 dominio.

---

## Outreach ai locali (tester / locandine / passaparola)

- **NON** mandarlo via Resend transazionale: 100/giorno è poco e l'invio a freddo automatizzato **rovina la reputazione** del dominio da cui parte anche la posta dell'app.
- Mandalo dalla **casella umana** (`bizdev@strabar.app`), 1‑a‑1 e personalizzato. Per un mail‑merge leggero: Gmail + estensione **YAMM**, oppure **Instantly/Lemlist** se sali di volume (fanno warmup e rotazione).
- La **newsletter opt-in** (chi si iscrive volontariamente) più avanti → **Resend Broadcasts** (gestisce audience + unsubscribe).
- ⚠️ **GDPR/EU**: l'invio B2B a freddo ha vincoli. Meglio contatto personale (telefono/Instagram) + consenso prima di mailing massive.

### Da dove partono i contatti
Admin → **Contatti locali (CRM)**: "Popola dai locali" importa i locali attivi su Strabar; "Arricchisci da Google" aggiunge telefono/sito; "Esporta CSV" per il mail‑merge. Le email si raccolgono a mano dal sito/Instagram del locale.
