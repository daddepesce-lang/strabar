'use client';

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Download, Share2, ArrowLeft, Beer, MessageCircle } from 'lucide-react';
import Link from 'next/link';

export default function ShareActivityPage({ params }) {
  const router = useRouter();
  // Unwrap params using React.use()
  const unwrappedParams = use(params);
  const activityId = unwrappedParams.id;
  
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  useEffect(() => {
    const loadActivity = async () => {
      try {
        const acts = await db.getActivities();
        const found = acts.find(a => a.id === activityId);
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

    // Disegna Sfondo (Gradiente Ambra Scuro / Nero)
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#1E1B18'); // Grigio scuro caldo
    gradient.addColorStop(0.5, '#0B0A09'); // Quasi nero
    gradient.addColorStop(1, '#FF5E00'); // Arancio neon Strabar (angolo basso destro)
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Disegna Cerchi Decorativi sfumati
    ctx.fillStyle = 'rgba(255, 94, 0, 0.08)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 400, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 176, 0, 0.05)';
    ctx.beginPath();
    ctx.arc(size, 0, 300, 0, Math.PI * 2);
    ctx.fill();

    // Bordi Neon Orange
    ctx.strokeStyle = '#FF5E00';
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, size - 20, size - 20);

    // LOGO "STRABAR" in alto
    ctx.fillStyle = '#FF5E00';
    ctx.font = 'bold 50px Outfit, -apple-system, sans-serif';
    ctx.fillText('STRA', 80, 120);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('BAR', 215, 120);

    // Sottotitolo "IL TERZO TEMPO DEGLI ATLETI"
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 22px Outfit, -apple-system, sans-serif';
    ctx.fillText('LO SPORT DEL BRINDISI', 80, 160);

    // Icona del boccale (semplice disegno a tratti o testo emoji per compatibilità)
    ctx.font = '70px Arial';
    ctx.fillText('🍻', size - 160, 130);

    // Titolo Attività (Centrato o allineato a sinistra)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 64px Outfit, -apple-system, sans-serif';
    // Gestione testo lungo
    const title = activity.title || 'Sessione Alcolica';
    ctx.fillText(title.length > 25 ? title.substring(0, 25) + '...' : title, 80, 280);

    // Nome Autore e data
    const author = activity.profiles?.display_name || 'Utente Strabar';
    const dateStr = new Date(activity.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.fillStyle = '#FFB000';
    ctx.font = '600 32px Outfit, -apple-system, sans-serif';
    ctx.fillText(`Registrato da: ${author}`, 80, 340);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '400 24px Outfit, -apple-system, sans-serif';
    ctx.fillText(dateStr, 80, 380);

    // Riquadro per le statistiche principali (Centro)
    const boxY = 460;
    const boxW = 920;
    const boxH = 320;
    
    // Sfondo riquadro glassmorphic
    ctx.fillStyle = 'rgba(22, 24, 34, 0.85)';
    ctx.strokeStyle = 'rgba(255, 94, 0, 0.3)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(80, boxY, boxW, boxH, 24);
    ctx.fill();
    ctx.stroke();

    // 3 Colonne per le Statistiche
    const colWidth = boxW / 3;

    // Stat 1: Drink Totali
    const totalDrinks = activity.drinks.reduce((acc, d) => acc + d.qty, 0);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 24px Outfit, -apple-system, sans-serif';
    ctx.fillText('DRINK TOTALI', 80 + colWidth / 2, boxY + 80);
    ctx.fillStyle = '#FF5E00';
    ctx.font = '800 96px Outfit, -apple-system, sans-serif';
    ctx.fillText(totalDrinks.toString(), 80 + colWidth / 2, boxY + 200);

    // Stat 2: Tempo
    const hrs = Math.floor(activity.duration / 60);
    const mins = activity.duration % 60;
    const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 24px Outfit, -apple-system, sans-serif';
    ctx.fillText('DURATA SFORZO', 80 + colWidth + colWidth / 2, boxY + 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 70px Outfit, -apple-system, sans-serif';
    ctx.fillText(timeStr, 80 + colWidth + colWidth / 2, boxY + 185);

    // Stat 3: Unità Alcoliche
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 24px Outfit, -apple-system, sans-serif';
    ctx.fillText('UNITA ALCOLICHE', 80 + colWidth * 2 + colWidth / 2, boxY + 80);
    ctx.fillStyle = '#FFB000';
    ctx.font = '800 80px Outfit, -apple-system, sans-serif';
    ctx.fillText(`${activity.total_units} U.A.`, 80 + colWidth * 2 + colWidth / 2, boxY + 195);

    // Reset allineamento a sinistra
    ctx.textAlign = 'left';

    // Lista Drink consumati in basso
    ctx.fillStyle = '#E5E7EB';
    ctx.font = '600 28px Outfit, -apple-system, sans-serif';
    ctx.fillText('LISTA PRESTAZIONI:', 80, 850);

    let drinkTags = activity.drinks.map(d => `${d.qty}x ${d.name}`).join('  •  ');
    if (drinkTags.length > 55) drinkTags = drinkTags.substring(0, 52) + '...';
    
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '400 26px Outfit, -apple-system, sans-serif';
    ctx.fillText(drinkTags, 80, 900);

    // Livello Ebbrezza in basso a destra
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px Outfit, -apple-system, sans-serif';
    ctx.fillText(`Ebbrezza: ${activity.feeling}`, size - 80, 850);
    ctx.textAlign = 'left';

    // Footer branding
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '500 22px Outfit, -apple-system, sans-serif';
    ctx.fillText('Scarica Strabar su strabar.app', 80, size - 70);

    ctx.textAlign = 'right';
    ctx.fillText('#StraBarAthletes', size - 80, size - 70);

  }, [activity]);

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
    return `🍻 ${activity.title}\n${drinks} drink • ${activity.total_units} U.A. • Stato: ${activity.feeling}\n\nTraccia le tue bevute su Strabar!`;
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button
            onClick={handleWhatsApp}
            className="btn"
            style={{ padding: '13px', borderRadius: '30px', fontSize: '15px', width: '100%', background: '#25D366', color: '#fff', fontWeight: 700 }}
          >
            <MessageCircle size={18} /> WhatsApp
          </button>
          <button
            onClick={handleDownload}
            className="btn btn-secondary"
            style={{ padding: '13px', borderRadius: '30px', fontSize: '15px', width: '100%' }}
          >
            <Download size={18} /> Scarica
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textAlign: 'center', marginTop: '4px' }}>
          Su telefono &quot;Condividi&quot; allega direttamente l&apos;immagine. Il pulsante WhatsApp condivide il testo: per la foto, scaricala e allegala.
        </p>
      </div>
    </div>
  );
}
