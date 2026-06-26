'use client';

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Download, Share2, ArrowLeft, Beer, MessageCircle, Send, Copy, Check } from 'lucide-react';
import Link from 'next/link';
import { siteUrl, SITE_HOST } from '@/lib/site';
import { publicName } from '@/lib/names';

export default function ShareActivityPage({ params }) {
  const router = useRouter();
  // Unwrap params using React.use()
  const unwrappedParams = use(params);
  const activityId = unwrappedParams.id;
  
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);
  const [sharingTheme, setSharingTheme] = useState('gradient');
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const logoRef = useRef(null);
  const [logoReady, setLogoReady] = useState(false);

  // Pre-carica il logo ufficiale di Strabar per disegnarlo sull'immagine condivisa.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { logoRef.current = img; setLogoReady(true); };
    img.onerror = () => { setLogoReady(false); };
    img.src = '/logo.png';
  }, []);

  useEffect(() => {
    const loadActivity = async () => {
      try {
        const found = await db.getActivity(activityId);
        if (found) {
          setActivity(found);
        }
      } catch (err) {
        console.error("Errore caricamento attività per condivisione:", err);
      } finally {
        setLoading(false);
      }
    };
    loadActivity();
  }, [activityId]);

  useEffect(() => {
    if (!activity || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Pulisci canvas (Dimensioni: 1080x1080 per risoluzione ottimale Instagram)
    const size = 1080;
    canvas.width = size;
    canvas.height = size;

    const images = activity.media?.filter(m => m.type === 'image') || [];
    const hasPhoto = images.length > 0;
    const usePhoto = sharingTheme === 'photo' && hasPhoto;
    const rawPhotoUrl = (images[selectedPhotoIdx] || images[0])?.url;
    // I media stanno su R2 (*.r2.dev) senza header CORS: caricarli direttamente con
    // crossOrigin fallisce e la foto non compare. Li facciamo passare dal proxy
    // same-origin /api/img così il canvas resta esportabile (vedi src/app/api/img).
    const photoUrl = rawPhotoUrl
      ? (rawPhotoUrl.startsWith('http') ? `/api/img?url=${encodeURIComponent(rawPhotoUrl)}` : rawPhotoUrl)
      : undefined;

    // Sessione ancora in diretta? (attiva e iniziata da meno di 5h)
    const isLive = !!activity.is_active && (Date.now() - new Date(activity.created_at).getTime() < 5 * 60 * 60 * 1000);

    // Per le sessioni live, BAC e durata vanno calcolati ADESSO: i valori salvati
    // (activity.bac_level / activity.duration) sono fermi al momento dell'ultimo salvataggio.
    const liveElapsedMin = Math.max(1, Math.round((Date.now() - new Date(activity.created_at).getTime()) / 60000));
    const displayDuration = isLive ? liveElapsedMin : (activity.duration || 0);
    // Residuo alcolico CONGELATO sulla sessione (uguale per tutti): va incluso, altrimenti
    // il BAC della card è 0,0 anche quando il pannello live mostra un residuo dalle sessioni
    // precedenti. sessionResidualGrams preferisce activity.residual_grams.
    const liveResidual = db.sessionResidualGrams(activity, [], activity.profiles?.weight, activity.profiles?.sex);
    const displayBac = isLive
      ? db.calculateCurrentBAC(activity.drinks || [], activity.created_at, liveElapsedMin, undefined, activity.profiles?.weight, activity.full_stomach, activity.profiles?.sex, liveResidual)
      : parseFloat(activity.bac_level || 0);

    const drawStats = () => {
      // 1. Disegna lo sfondo
      if (usePhoto) {
        // Vignettatura scura in alto
        const topGrad = ctx.createLinearGradient(0, 0, 0, 300);
        topGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
        topGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, size, 300);

        // Vignettatura scura in basso
        const bottomGrad = ctx.createLinearGradient(0, size - 450, 0, size);
        bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
        bottomGrad.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = bottomGrad;
        ctx.fillRect(0, size - 450, size, 450);

        // Bordo neon leggero
        ctx.strokeStyle = '#FF2000';
        ctx.lineWidth = 14;
        ctx.strokeRect(7, 7, size - 14, size - 14);
      } else {
        // Gradiente classico Strabar
        const gradient = ctx.createLinearGradient(0, 0, size, size);
        gradient.addColorStop(0, '#1E1B18'); // Grigio scuro caldo
        gradient.addColorStop(0.5, '#0B0A09'); // Quasi nero
        gradient.addColorStop(1, '#FF2000'); // Arancio neon Strabar
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        // Disegna Cerchi Decorativi sfumati
        ctx.fillStyle = 'rgba(255, 32, 0, 0.08)';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 400, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(223, 255, 0, 0.05)';
        ctx.beginPath();
        ctx.arc(size, 0, 300, 0, Math.PI * 2);
        ctx.fill();

        // Bordi Neon Orange
        ctx.strokeStyle = '#FF2000';
        ctx.lineWidth = 20;
        ctx.strokeRect(10, 10, size - 20, size - 20);
      }

      // LOGO ufficiale Strabar (immagine). Fallback al testo se non ancora caricato.
      if (logoReady && logoRef.current && logoRef.current.naturalWidth) {
        const lh = 72;
        const lw = lh * (logoRef.current.naturalWidth / logoRef.current.naturalHeight);
        ctx.drawImage(logoRef.current, 80, 64, lw, lh);
      } else {
        ctx.fillStyle = '#FF2000';
        ctx.font = 'bold 50px "DM Sans", -apple-system, sans-serif';
        ctx.fillText('STRA', 80, 120);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('BAR', 215, 120);
      }

      // Sottotitolo
      ctx.fillStyle = usePhoto ? '#E5E7EB' : '#9CA3AF';
      ctx.font = '600 22px "DM Sans", -apple-system, sans-serif';
      ctx.fillText('LO SPORT DEL BRINDISI', 80, 160);

      // In alto a destra: badge "LIVE" se in diretta, altrimenti l'emoji brindisi.
      if (isLive) {
        const pw = 168, ph = 56, px = size - 80 - pw, py = 72;
        ctx.fillStyle = '#FF2000';
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, ph / 2);
        ctx.fill();
        // pallino bianco
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px + 34, py + ph / 2, 10, 0, Math.PI * 2);
        ctx.fill();
        // testo LIVE
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 32px "DM Sans", -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('LIVE', px + 58, py + ph / 2 + 2);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
      } else {
        ctx.font = '70px Arial';
        ctx.fillText('🍻', size - 160, 130);
      }

      // Titolo Attività
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 64px "DM Sans", -apple-system, sans-serif';
      const title = activity.title || 'Sessione Alcolica';
      ctx.fillText(title.length > 25 ? title.substring(0, 25) + '...' : title, 80, 280);

      // Nome Autore e data
      const author = publicName(activity.profiles, 'Utente Strabar');
      const dateStr = new Date(activity.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
      ctx.fillStyle = '#DFFF00';
      ctx.font = '600 32px "DM Sans", -apple-system, sans-serif';
      ctx.fillText(`Registrato da: ${author}`, 80, 340);
      ctx.fillStyle = usePhoto ? '#E5E7EB' : '#9CA3AF';
      ctx.font = '400 24px "DM Sans", -apple-system, sans-serif';
      ctx.fillText(dateStr, 80, 380);

      // Riquadro per le statistiche principali (Centro)
      const boxY = 460;
      const boxW = 920;
      const boxH = 344;
      
      // Sfondo riquadro glassmorphic
      ctx.fillStyle = usePhoto ? 'rgba(11, 10, 9, 0.65)' : 'rgba(22, 24, 34, 0.85)';
      ctx.strokeStyle = 'rgba(255, 32, 0, 0.4)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(80, boxY, boxW, boxH, 24);
      ctx.fill();
      ctx.stroke();

      // 3 Colonne per le Statistiche
      const colWidth = boxW / 3;
      const maxValW = colWidth - 36; // margine interno per non sforare la cornice

      // Imposta il font del valore riducendolo finché entra nella colonna
      const setValueFont = (text, baseSize) => {
        let s = baseSize;
        do {
          ctx.font = `800 ${s}px "DM Sans", -apple-system, sans-serif`;
          if (ctx.measureText(text).width <= maxValW) break;
          s -= 4;
        } while (s > 26);
      };

      // Stat 1: Drink Totali
      const totalDrinks = activity.drinks ? activity.drinks.reduce((acc, d) => acc + d.qty, 0) : 0;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '600 24px "DM Sans", -apple-system, sans-serif';
      ctx.fillText('DRINK TOTALI', 80 + colWidth / 2, boxY + 80);
      ctx.fillStyle = '#FF2000';
      setValueFont(totalDrinks.toString(), 96);
      ctx.fillText(totalDrinks.toString(), 80 + colWidth / 2, boxY + 200);

      // Stat 2: Tempo (per i live = minuti trascorsi da inizio sessione, calcolati ora)
      const hrs = Math.floor(displayDuration / 60);
      const mins = displayDuration % 60;
      const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '600 24px "DM Sans", -apple-system, sans-serif';
      ctx.fillText(isLive ? 'TEMPO A TAVOLA' : 'DURATA SFORZO', 80 + colWidth + colWidth / 2, boxY + 80);
      ctx.fillStyle = '#FFFFFF';
      setValueFont(timeStr, 70);
      ctx.fillText(timeStr, 80 + colWidth + colWidth / 2, boxY + 185);

      // Stat 3: Unità Alcoliche (numero grande + "U.A." piccolo sotto, così non sfora mai)
      const col3Center = 80 + colWidth * 2 + colWidth / 2;
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '600 24px "DM Sans", -apple-system, sans-serif';
      ctx.fillText('UNITÀ ALCOLICHE', col3Center, boxY + 80);
      ctx.fillStyle = '#DFFF00';
      const uaValue = `${activity.total_units}`;
      setValueFont(uaValue, 80);
      ctx.fillText(uaValue, col3Center, boxY + 190);
      ctx.fillStyle = '#DFFF00';
      ctx.font = '700 26px "DM Sans", -apple-system, sans-serif';
      ctx.fillText('U.A.', col3Center, boxY + 232);

      // TASSO ALCOLICO stimato — riga in fondo al riquadro, colore semaforico.
      // Su sessione live è il valore ATTUALE; su sessione chiusa è il PICCO.
      const peakBac = displayBac;
      const bacCol = peakBac >= 0.5 ? '#FF2000' : peakBac >= 0.2 ? '#DFFF00' : '#2ED573';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(80 + 40, boxY + 250);
      ctx.lineTo(80 + boxW - 40, boxY + 250);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '600 22px "DM Sans", -apple-system, sans-serif';
      ctx.fillText(isLive ? 'TASSO ALCOLICO ATTUALE (STIMA)' : 'TASSO ALCOLICO DI PICCO (STIMA)', 80 + boxW / 2, boxY + 286);
      ctx.fillStyle = bacCol;
      ctx.font = '800 40px "DM Sans", -apple-system, sans-serif';
      ctx.fillText(`${peakBac.toFixed(2)} g/l`, 80 + boxW / 2, boxY + 326);

      // Reset allineamento a sinistra
      ctx.textAlign = 'left';

      // Lista Drink consumati in basso
      ctx.fillStyle = '#E5E7EB';
      ctx.font = '600 28px "DM Sans", -apple-system, sans-serif';
      ctx.fillText('LISTA PRESTAZIONI:', 80, 850);

      // Raggruppa i drink uguali sommando le quantità
      const groupedForTags = (() => {
        const m = {};
        (activity.drinks || []).forEach((d) => {
          const k = `${(d.name || '').trim()}|${d.abv ?? ''}`;
          if (!m[k]) m[k] = { name: d.name, qty: 0 };
          m[k].qty += (d.qty || 1);
        });
        return Object.values(m);
      })();
      let drinkTags = groupedForTags.map((d) => `${d.qty}x ${d.name}`).join('  •  ');
      if (drinkTags.length > 55) drinkTags = drinkTags.substring(0, 52) + '...';
      
      ctx.fillStyle = usePhoto ? '#E5E7EB' : '#9CA3AF';
      ctx.font = '400 26px "DM Sans", -apple-system, sans-serif';
      ctx.fillText(drinkTags, 80, 900);

      // Livello Ebbrezza in basso a destra
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px "DM Sans", -apple-system, sans-serif';
      ctx.fillText(`Ebbrezza: ${activity.feeling}`, size - 80, 850);
      ctx.textAlign = 'left';

      // Footer branding — URL reale di installazione
      const installHost = SITE_HOST; // dominio canonico (strabar.app) sulla card social
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = '600 22px "DM Sans", -apple-system, sans-serif';
      ctx.fillText(`📲 Installa: ${installHost}/install`, 80, size - 70);

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillText('#StraBarAthletes', size - 80, size - 70);
    };

    if (usePhoto) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const imgRatio = img.width / img.height;
        let drawWidth = size;
        let drawHeight = size;
        let offsetX = 0;
        let offsetY = 0;

        if (imgRatio > 1) {
          drawWidth = size * imgRatio;
          offsetX = -(drawWidth - size) / 2;
        } else {
          drawHeight = size / imgRatio;
          offsetY = -(drawHeight - size) / 2;
        }

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        drawStats();
      };
      img.onerror = () => {
        // Fallback gradiente classico in caso di errore caricamento foto
        const gradient = ctx.createLinearGradient(0, 0, size, size);
        gradient.addColorStop(0, '#1E1B18');
        gradient.addColorStop(0.5, '#0B0A09');
        gradient.addColorStop(1, '#FF2000');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        drawStats();
      };
      img.src = photoUrl;
    } else {
      drawStats();
    }
  }, [activity, sharingTheme, selectedPhotoIdx, logoReady]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    link.download = `strabar_${activity.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.jpg`;
    link.href = dataUrl;
    link.click();
  };

  const shareCaption = () => {
    const drinks = activity.drinks.reduce((acc, d) => acc + d.qty, 0);
    const installUrl = siteUrl('/install');
    return `🍻 ${activity.title}\n${drinks} drink • ${activity.total_units} U.A. • Stato: ${activity.feeling}\n\nUnisciti a me su Strabar 👉 ${installUrl}`;
  };

  // Condivisione nativa con l'immagine (apre il foglio di sistema: WhatsApp, IG, ecc.)
  const handleNativeShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
      const file = new File([blob], 'strabar.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareCaption() });
        return;
      }
      if (navigator.share) {
        await navigator.share({ text: shareCaption() });
        return;
      }
      handleDownload();
    } catch {
      /* annullato dall'utente */
    }
  };

  // Condivisione testuale diretta su WhatsApp (l'immagine va scaricata e allegata a mano)
  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareCaption())}`, '_blank', 'noopener,noreferrer');
  };

  // Link canonico alla sessione condivisa: punta sempre a strabar.app/share/<id>.
  const shareUrl = () => siteUrl(`/share/${activityId}`);

  const handleTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl())}&text=${encodeURIComponent(shareCaption())}`, '_blank', 'noopener,noreferrer');
  };

  const handleTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareCaption())}&url=${encodeURIComponent(shareUrl())}`, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareCaption()}\n${shareUrl()}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Copia non riuscita. Copia manualmente il link dalla barra del browser.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 'bold' }}>
          Generando la tua scheda social... 📊
        </div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <h2>Attività non trovata.</h2>
        <Link href="/" style={{ color: 'var(--primary)' }}>Torna al Feed</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '50px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dark-secondary)', fontSize: '14px', fontWeight: '600' }}>
          <ArrowLeft size={16} /> Torna al Feed
        </Link>
        <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>Condividi le tue imprese!</span>
      </div>

      <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '10px' }}>Esporta Card Social</h1>
      <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginBottom: '25px' }}>
        Abbiamo generato una card grafica quadrata perfetta per le tue storie di Instagram o post su WhatsApp/Twitter. Scaricala con il pulsante qui sotto.
      </p>

      {/* Selettore Stile Condivisione (solo se ci sono foto) */}
      {activity.media?.filter(m => m.type === 'image').length > 0 && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            type="button"
            onClick={() => setSharingTheme('gradient')} 
            className="btn" 
            style={{ 
              flex: 1, 
              borderRadius: '20px', 
              fontSize: '13px', 
              padding: '10px',
              fontWeight: 'bold',
              background: sharingTheme === 'gradient' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
              color: sharingTheme === 'gradient' ? '#FFF' : 'var(--text-dark-secondary)',
              border: sharingTheme === 'gradient' ? 'none' : '1px solid var(--border-dark)',
              cursor: 'pointer',
              transition: 'var(--transition)'
            }}
          >
            🎨 Sfondo Gradiente
          </button>
          <button
            type="button"
            onClick={() => setSharingTheme('photo')}
            className="btn"
            style={{
              flex: 1,
              borderRadius: '20px',
              fontSize: '13px',
              padding: '10px',
              fontWeight: 'bold',
              background: sharingTheme === 'photo' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
              color: sharingTheme === 'photo' ? '#FFF' : 'var(--text-dark-secondary)',
              border: sharingTheme === 'photo' ? 'none' : '1px solid var(--border-dark)',
              cursor: 'pointer',
              transition: 'var(--transition)'
            }}
          >
            📸 La tua foto
          </button>
        </div>
      )}

      {/* Scelta della foto da usare come sfondo della card */}
      {sharingTheme === 'photo' && activity.media?.filter(m => m.type === 'image').length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
            Scegli la foto di copertina
          </span>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {activity.media.filter(m => m.type === 'image').map((med, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedPhotoIdx(idx)}
                style={{
                  width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, cursor: 'pointer', padding: 0,
                  border: selectedPhotoIdx === idx ? '3px solid var(--primary)' : '2px solid var(--border-dark)',
                  boxShadow: selectedPhotoIdx === idx ? '0 0 10px rgba(255, 32, 0,0.4)' : 'none',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={med.url} alt={`foto ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas nascosto o mostrato a dimensione ridotta per preview responsiva */}
      <div style={{ width: '100%', border: '2px solid var(--border-dark)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: '25px', aspectRatio: '1' }}>
        <canvas 
          ref={canvasRef} 
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={handleNativeShare}
          className="btn btn-primary"
          style={{ padding: '14px', borderRadius: '30px', fontSize: '16px', width: '100%' }}
        >
          <Share2 size={18} /> Condividi (Instagram, WhatsApp…)
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <button
            onClick={handleWhatsApp}
            className="btn"
            style={{ padding: '12px', borderRadius: '20px', fontSize: '14px', width: '100%', background: '#25D366', color: '#fff', fontWeight: 700 }}
          >
            <MessageCircle size={17} /> WhatsApp
          </button>
          <button
            onClick={handleTelegram}
            className="btn"
            style={{ padding: '12px', borderRadius: '20px', fontSize: '14px', width: '100%', background: '#229ED9', color: '#fff', fontWeight: 700 }}
          >
            <Send size={16} /> Telegram
          </button>
          <button
            onClick={handleTwitter}
            className="btn"
            style={{ padding: '12px', borderRadius: '20px', fontSize: '14px', width: '100%', background: '#000', color: '#fff', fontWeight: 700, border: '1px solid var(--border-dark)' }}
          >
            𝕏 Post
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button
            onClick={handleCopyLink}
            className="btn btn-secondary"
            style={{ padding: '12px', borderRadius: '20px', fontSize: '14px', width: '100%' }}
          >
            {copied ? <><Check size={17} /> Copiato!</> : <><Copy size={17} /> Copia link</>}
          </button>
          <button
            onClick={handleDownload}
            className="btn btn-secondary"
            style={{ padding: '12px', borderRadius: '20px', fontSize: '14px', width: '100%' }}
          >
            <Download size={17} /> Scarica
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textAlign: 'center', marginTop: '4px' }}>
          Su telefono &quot;Condividi&quot; allega direttamente l&apos;immagine (con la foto scelta). Gli altri pulsanti condividono testo e link: per allegare l&apos;immagine, scaricala prima.
        </p>
      </div>

      {/* Riquadro Iscrizione / Partecipazione per Non-Utenti */}
      <div className="card" style={{ marginTop: '30px', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255, 32, 0,0.08) 100%)', textAlign: 'center', padding: '24px', borderRadius: 'var(--radius)' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px', color: '#FFF' }}>
          🍻 Vuoi partecipare anche tu alle sfide di Strabar?
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '18px', lineHeight: '1.4' }}>
          Unisciti alla community degli atleti del brindisi! Registrati in pochi secondi per tracciare le tue bevute, taggare i tuoi amici, calcolare il tasso alcolico (BAC) e sfidare gli altri nelle classifiche dei bar!
        </p>
        <Link href="/auth" className="btn btn-primary" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: '30px', fontSize: '14px', textDecoration: 'none', fontWeight: '700' }}>
          Registrati Ora su Strabar 🚀
        </Link>
      </div>
    </div>
  );
}
