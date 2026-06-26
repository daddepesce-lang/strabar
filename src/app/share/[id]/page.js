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
  const [cardFormat, setCardFormat] = useState('story'); // 'story' 9:16 | 'post' 1:1
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
          // Default: foto se c'è, altrimenti mappa (se geolocalizzata e non nascosta), altrimenti gradiente.
          const hasImg = (found.media || []).some((m) => m.type === 'image');
          const l = found.location;
          const geo = l && typeof l.lat === 'number' && typeof (l.lng ?? l.lon) === 'number' && !l.hidden;
          if (hasImg) setSharingTheme('photo');
          else if (geo) setSharingTheme('map');
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
    
    // Foto protagonista a tutto schermo (stile Strava/BeReal). Formato scelto dall'utente:
    // 'story' 1080x1920 (9:16) o 'post' 1080x1080 (1:1).
    const W = 1080;
    const H = cardFormat === 'post' ? 1080 : 1920;
    // Super-sampling: render a risoluzione maggiore → testo/grafica più nitidi.
    // NESSUN egress in più: la foto sorgente è la stessa, qui solo upscaling locale.
    const S = 1.5;
    canvas.width = Math.round(W * S);
    canvas.height = Math.round(H * S);
    ctx.setTransform(S, 0, 0, S, 0, 0); // si disegna sempre in coordinate "design" W×H

    const images = activity.media?.filter(m => m.type === 'image') || [];
    const hasPhoto = images.length > 0;
    const usePhoto = sharingTheme === 'photo' && hasPhoto;
    // Sfondo-mappa (CARTO dark, gratis senza chiave) quando non c'è foto ma c'è la posizione.
    const loc = activity.location;
    const geoLat = loc && typeof loc.lat === 'number' ? loc.lat : null;
    const geoLng = loc && typeof (loc.lng ?? loc.lon) === 'number' ? (loc.lng ?? loc.lon) : null;
    const hasGeo = geoLat !== null && geoLng !== null && !loc?.hidden;
    const useMap = sharingTheme === 'map' && hasGeo;
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
    // Live → BAC attuale (come il pannello live). Sessione chiusa → BAC di PICCO
    // (come il feed): activity.bac_level è lo snapshot dell'ultimo salvataggio e a
    // sessione finita è quasi sempre 0,0 (alcol ormai smaltito) → la card mostrava 0.
    const displayBac = isLive
      ? db.calculateCurrentBAC(activity.drinks || [], activity.created_at, liveElapsedMin, undefined, activity.profiles?.weight, activity.full_stomach, activity.profiles?.sex, liveResidual)
      : db.calculatePeakBAC(activity.drinks || [], activity.created_at, activity.duration || displayDuration, activity.profiles?.weight, activity.full_stomach, activity.profiles?.sex, liveResidual);

    // Emoji indicativa del drink per la riga "Performance".
    const drinkEmoji = (name) => {
      const n = (name || '').toLowerCase();
      if (/birra|beer|lager|ipa|weiss|stout|malto|bionda|rossa/.test(n)) return '🍺';
      if (/vino|wine|rosso|bianco|prosecco|spumante|bollicine|champagne/.test(n)) return '🍷';
      if (/spritz|aperol|hugo|mojito|margarita|daiquiri|cocktail|americano/.test(n)) return '🍹';
      if (/shot|tequila|vodka|rum|gin|whisky|whiskey|grappa|amaro|negroni|sambuca|liquore/.test(n)) return '🥃';
      if (/acqua|water|soda|cola|succo|analc|tè|the|caff/.test(n)) return '🥤';
      return '🍸';
    };

    const drawStats = () => {
      const M = 90;                 // margine laterale
      const compact = H <= 1200;    // formato post (1:1) più compatto della storia (9:16)

      // --- Sfondo / overlay (foto o mappa protagonista) ---
      if (usePhoto || useMap) {
        const top = ctx.createLinearGradient(0, 0, 0, 380);
        top.addColorStop(0, 'rgba(0,0,0,0.7)');
        top.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = top; ctx.fillRect(0, 0, W, 380);
        const bStart = H * 0.40;
        const bot = ctx.createLinearGradient(0, bStart, 0, H);
        bot.addColorStop(0, 'rgba(0,0,0,0)');
        bot.addColorStop(0.5, 'rgba(0,0,0,0.72)');
        bot.addColorStop(1, 'rgba(0,0,0,0.97)');
        ctx.fillStyle = bot; ctx.fillRect(0, bStart, W, H - bStart);
      } else {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#17181B');
        g.addColorStop(0.55, '#0B0A09');
        g.addColorStop(1, '#2A0A05');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const glow = ctx.createRadialGradient(W / 2, H * 0.92, 60, W / 2, H * 0.92, 760);
        glow.addColorStop(0, 'rgba(255,32,0,0.20)');
        glow.addColorStop(1, 'rgba(255,32,0,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, H * 0.45, W, H * 0.55);
      }

      // --- Logo in alto a sinistra ---
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (logoReady && logoRef.current && logoRef.current.naturalWidth) {
        const lh = 58; const lw = lh * (logoRef.current.naturalWidth / logoRef.current.naturalHeight);
        ctx.drawImage(logoRef.current, M, 74, lw, lh);
      } else {
        ctx.fillStyle = '#FF2000'; ctx.font = '800 48px "DM Sans", sans-serif';
        ctx.fillText('strabar', M, 120);
      }

      // --- LIVE badge in alto a destra ---
      if (isLive) {
        ctx.textBaseline = 'middle';
        ctx.font = '800 32px "DM Sans", sans-serif';
        const tw = ctx.measureText('LIVE').width;
        const pw = tw + 84, ph = 56, px = W - M - pw, py = 76;
        ctx.fillStyle = '#FF2000'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, ph / 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + 30, py + ph / 2, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText('LIVE', px + 50, py + ph / 2 + 1);
        ctx.textBaseline = 'alphabetic';
      }

      // ====== DATI ======
      const totalDrinks = (activity.drinks || []).reduce((a, d) => a + (d.qty || 1), 0);
      const grouped = (() => {
        const m = {};
        (activity.drinks || []).forEach((d) => {
          const k = (d.name || '').trim().toLowerCase();
          if (!m[k]) m[k] = { name: d.name || 'Drink', qty: 0 };
          m[k].qty += (d.qty || 1);
        });
        return Object.values(m).sort((a, b) => b.qty - a.qty);
      })();

      // Badge della serata: derivato dall'intensità (displayBac) ma SENZA mostrare il numero.
      const badge = (() => {
        if (totalDrinks === 0) return { t: 'PRIMO SORSO', e: '🍸', c: '#9CA3AF' };
        if (displayBac < 0.2) return { t: 'SOBRIO', e: '🟢', c: '#2ED573' };
        if (displayBac < 0.5) return { t: 'IN RISCALDAMENTO', e: '🟡', c: '#DFFF00' };
        if (displayBac < 0.8) return { t: 'IN PARTITA', e: '🟠', c: '#FF9F1C' };
        return { t: 'FUORI CATEGORIA', e: '🔴', c: '#FF2000' };
      })();

      // Frase automatica in base alla prestazione (deterministica per sessione).
      const phrasePool = (() => {
        if (totalDrinks === 0) return ['La serata è appena iniziata.', 'Si comincia.'];
        if (displayBac < 0.2) return ['Partenza prudente.', 'Tutto sotto controllo.'];
        if (displayBac < 0.5) return ['Ottimo riscaldamento.', 'Il motore si scalda.'];
        if (displayBac < 0.8) return ['Bella gestione.', 'Sei in partita.', 'Hai dato spettacolo.'];
        return ['Domani rileggi le chat.', 'Leggenda della serata.'];
      })();
      const phrase = phrasePool[totalDrinks % phrasePool.length];

      // Statistica principale: "1 SPRITZ" se un solo tipo, altrimenti "N DRINK".
      const mainStat = grouped.length === 1
        ? `${grouped[0].qty} ${grouped[0].name.toUpperCase()}`
        : `${totalDrinks} DRINK`;

      const hrs = Math.floor(displayDuration / 60), mins = displayDuration % 60;
      const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
      const secondary = `⏱ ${timeStr}      🍺 ${activity.total_units} UA`;

      const author = publicName(activity.profiles, 'Atleta Strabar');
      const dateStr = new Date(activity.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
      const meta = `Registrato da ${author} · ${dateStr}`;

      const perf = grouped.length
        ? grouped.slice(0, 3).map((d) => `${drinkEmoji(d.name)} ${d.name} ×${d.qty}`).join('    ')
        : '';

      // CTA variabile ma STABILE per sessione (hash dell'id → stessa frase a ogni render).
      const ctaPool = ['E tu quanto fai?', 'Batti questa prestazione.', 'Registra il tuo brindisi.', 'Tocca a te.', 'Reggi il confronto?'];
      const idHash = String(activity.id || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
      const ctaText = ctaPool[idHash % ctaPool.length];

      // --- helper layout ---
      const maxW = W - M * 2;
      const wrap = (text, font, mw) => {
        ctx.font = font;
        const words = (text || '').split(' '); const lines = []; let line = '';
        words.forEach((w) => {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width > mw && line) { lines.push(line); line = w; } else line = test;
        });
        if (line) lines.push(line);
        return lines;
      };
      // Riduce il font finché entra; se al minimo è ancora troppo lungo, tronca con ellissi.
      // Garantisce che NIENTE esca dalla card (es. nomi di drink lunghi).
      const fitText = (text, weight, base, min) => {
        let s = base;
        ctx.font = `${weight} ${s}px "DM Sans", sans-serif`;
        while (ctx.measureText(text).width > maxW && s > min) { s -= 4; ctx.font = `${weight} ${s}px "DM Sans", sans-serif`; }
        let t = text;
        if (ctx.measureText(t).width > maxW) {
          while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
          t = t.trimEnd() + '…';
        }
        return { text: t, size: s };
      };

      const titleSize = compact ? 58 : 74;
      const stat = fitText(mainStat, '800', compact ? 104 : 148, 44);
      const statSize = stat.size;
      let titleLines = wrap(activity.title || 'Brindisi', `800 ${titleSize}px "DM Sans", sans-serif`, maxW);
      if (titleLines.length > 2) { titleLines = titleLines.slice(0, 2); titleLines[1] = titleLines[1].slice(0, -1) + '…'; }

      // altezze blocchi (per ancorare il contenuto in basso, sopra la CTA)
      const gBadge = 62, gapBadge = compact ? 20 : 30;
      const lhTitle = titleSize + 8, gapTitle = compact ? 12 : 18;
      const hMeta = 34, gapMeta = compact ? 16 : 26;
      const hStat = statSize, gapStat = compact ? 12 : 20;
      const hSec = 40, gapSec = compact ? 16 : 28;
      const hPhrase = compact ? 44 : 52, gapPhrase = compact ? 14 : 22;
      const hPerf = perf ? 42 : 0;
      const totalH = gBadge + gapBadge + titleLines.length * lhTitle + gapTitle
        + hMeta + gapMeta + hStat + gapStat + hSec + gapSec + hPhrase + gapPhrase + hPerf;

      // --- CTA in fondo (stimola la condivisione, non "installa") ---
      const ctaTop = H - (compact ? 60 : 92);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.font = '700 30px "DM Sans", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(ctaText, M, ctaTop);
      ctx.textAlign = 'right';
      ctx.font = '800 30px "DM Sans", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(SITE_HOST, W - M, ctaTop);
      ctx.textAlign = 'left';

      // cursore: parte sopra la CTA, ancorato al fondo
      let y = ctaTop - (compact ? 30 : 52) - totalH;

      // Badge pill
      ctx.font = '800 32px "DM Sans", sans-serif';
      const bl = `${badge.e} ${badge.t}`;
      const blw = ctx.measureText(bl).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeStyle = badge.c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(M, y, blw + 56, gBadge, gBadge / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = badge.c; ctx.textBaseline = 'middle';
      ctx.fillText(bl, M + 28, y + gBadge / 2 + 1);
      ctx.textBaseline = 'top';
      y += gBadge + gapBadge;

      // Titolo (grande)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 ${titleSize}px "DM Sans", sans-serif`;
      titleLines.forEach((ln) => { ctx.fillText(ln, M, y); y += lhTitle; });
      y += gapTitle - 8;

      // Autore · data (piccolo)
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '600 30px "DM Sans", sans-serif';
      ctx.fillText(meta, M, y);
      y += hMeta + gapMeta;

      // STATISTICA PRINCIPALE (eroe) — testo già adattato/troncato per non sforare.
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 ${statSize}px "DM Sans", sans-serif`;
      ctx.fillText(stat.text, M, y);
      y += hStat + gapStat;

      // Statistiche secondarie
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 36px "DM Sans", sans-serif';
      ctx.fillText(secondary, M, y);
      y += hSec + gapSec;

      // Frase automatica (colore del badge)
      ctx.fillStyle = badge.c;
      ctx.font = `700 italic ${compact ? 36 : 42}px "DM Sans", sans-serif`;
      ctx.fillText(phrase, M, y);
      y += hPhrase + gapPhrase;

      // Performance (lista pulita, max 3 tipi)
      if (perf) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        const pf = fitText(perf, '600', 32, 20);
        ctx.font = `600 ${pf.size}px "DM Sans", sans-serif`;
        ctx.fillText(pf.text, M, y);
      }

      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    };

    // Disegna lo sfondo-mappa (CARTO dark) componendo i tile, poi le statistiche.
    // Egress contenuto: la mappa copre solo il quadrato in alto (W×W); il resto è scuro
    // perché il gradiente in basso lo coprirebbe comunque. Tile immutabili → cache lunga.
    const drawMapThenStats = () => {
      const Z = 15, TS = 512; // tile @2x: meno tile a parità di copertura
      const n = 2 ** Z;
      const latRad = geoLat * Math.PI / 180;
      const cxPx = ((geoLng + 180) / 360 * n) * TS;
      const cyPx = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n) * TS;
      const mapH = W; // la mappa occupa il quadrato superiore W×W, locale al centro
      const originX = cxPx - W / 2;
      const originY = cyPx - mapH / 2;
      const x0 = Math.floor(originX / TS), x1 = Math.floor((originX + W) / TS);
      const y0 = Math.floor(originY / TS), y1 = Math.floor((originY + mapH) / TS);
      const tiles = [];
      for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) tiles.push({ tx, ty });
      const store = {}; let done = 0;
      const finish = () => {
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
        tiles.forEach(({ tx, ty }) => {
          const im = store[`${tx}_${ty}`];
          if (im) ctx.drawImage(im, tx * TS - originX, ty * TS - originY, TS, TS);
        });
        // Pin del locale al centro della mappa
        const px = W / 2, py = mapH / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(px, py + 18, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FF2000'; ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
        drawStats();
      };
      tiles.forEach(({ tx, ty }) => {
        const im = new Image(); im.crossOrigin = 'anonymous';
        const xn = ((tx % n) + n) % n;
        const url = `https://basemaps.cartocdn.com/dark_all/${Z}/${xn}/${ty}@2x.png`;
        im.onload = () => { store[`${tx}_${ty}`] = im; if (++done === tiles.length) finish(); };
        im.onerror = () => { if (++done === tiles.length) finish(); };
        im.src = `/api/img?url=${encodeURIComponent(url)}`;
      });
    };

    const render = () => {
    if (useMap) {
      drawMapThenStats();
    } else if (usePhoto) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Cover: la foto riempie tutto il canvas (qualunque formato) senza deformarsi.
        const imgRatio = img.width / img.height;
        const canvasRatio = W / H;
        let dw, dh, ox, oy;
        if (imgRatio > canvasRatio) { dh = H; dw = H * imgRatio; ox = -(dw - W) / 2; oy = 0; }
        else { dw = W; dh = W / imgRatio; ox = 0; oy = -(dh - H) / 2; }
        ctx.drawImage(img, ox, oy, dw, dh);
        drawStats();
      };
      img.onerror = () => {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#17181B');
        g.addColorStop(0.55, '#0B0A09');
        g.addColorStop(1, '#2A0A05');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        drawStats();
      };
      img.src = photoUrl;
    } else {
      drawStats();
    }
    };
    // Disegna SOLO dopo che i font sono pronti: così measureText combacia col render
    // (i nomi lunghi venivano misurati col font di fallback e poi sforavano).
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    else render();
  }, [activity, sharingTheme, cardFormat, selectedPhotoIdx, logoReady]);

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
        La tua serata in una card: foto a tutto schermo, perfetta per le storie di Instagram o i post. Scegli formato e sfondo, poi condividi.
      </p>

      {/* Selettore sfondo: Foto (se c'è) · Mappa (se geolocalizzata) · Gradiente */}
      {(() => {
        const hasImg = activity.media?.some((m) => m.type === 'image');
        const l = activity.location;
        const geo = l && typeof l.lat === 'number' && typeof (l.lng ?? l.lon) === 'number' && !l.hidden;
        const opts = [
          ...(hasImg ? [{ v: 'photo', label: '📸 Foto' }] : []),
          ...(geo ? [{ v: 'map', label: '🗺️ Mappa' }] : []),
          { v: 'gradient', label: '🎨 Gradiente' },
        ];
        if (opts.length < 2) return null; // nessuna scelta utile → niente selettore
        return (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            {opts.map((o) => {
              const on = sharingTheme === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setSharingTheme(o.v)}
                  className="btn"
                  style={{
                    flex: 1, borderRadius: '20px', fontSize: '13px', padding: '10px', fontWeight: 'bold',
                    background: on ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                    color: on ? '#FFF' : 'var(--text-dark-secondary)',
                    border: on ? 'none' : '1px solid var(--border-dark)',
                    cursor: 'pointer', transition: 'var(--transition)',
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      })()}

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

      {/* Selettore formato: Storia 9:16 o Post 1:1 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {[
          { v: 'story', label: '📱 Storia', sub: '9:16' },
          { v: 'post', label: '⬛ Post', sub: '1:1' },
        ].map((f) => {
          const on = cardFormat === f.v;
          return (
            <button
              key={f.v}
              type="button"
              onClick={() => setCardFormat(f.v)}
              className="btn"
              style={{
                flex: 1, borderRadius: '20px', fontSize: '13px', padding: '10px', fontWeight: 'bold',
                background: on ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                color: on ? '#FFF' : 'var(--text-dark-secondary)',
                border: on ? 'none' : '1px solid var(--border-dark)', cursor: 'pointer',
              }}
            >
              {f.label} <span style={{ opacity: 0.7, fontWeight: 600 }}>{f.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Preview della card (proporzioni reali del formato scelto) */}
      <div style={{ width: '100%', maxWidth: cardFormat === 'post' ? '100%' : '340px', margin: cardFormat === 'post' ? '0 0 25px' : '0 auto 25px', border: '2px solid var(--border-dark)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)', aspectRatio: cardFormat === 'post' ? '1 / 1' : '9 / 16' }}>
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
