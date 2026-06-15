'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Beer, Plus, Minus, Calendar, Clock, Heart, Users, Save, Trash2, MapPin, Camera, Video, Mic, Volume2 } from 'lucide-react';

const PRESET_DRINKS = [
  { name: 'Spritz (Campari/Aperol/Select)', abv: 11, volumeMl: 150, category: 'Aperitivo', units: 1.3 },
  { name: 'Birra Chiara Media', abv: 5, volumeMl: 400, category: 'Birra', units: 1.6 },
  { name: 'Birra IPA Artigianale', abv: 6.5, volumeMl: 400, category: 'Birra', units: 2.1 },
  { name: 'Calice Vino (Rosso/Bianco/Prosecco)', abv: 12.5, volumeMl: 125, category: 'Vino', units: 1.3 },
  { name: 'Cocktail (Gin Tonic/Negroni/Moscow Mule)', abv: 25, volumeMl: 150, category: 'Cocktail', units: 2.5 },
  { name: 'Shot (Tequila/Rhum/Chupito)', abv: 40, volumeMl: 40, category: 'Shot', units: 1.3 }
];

export default function LogActivityPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(120); // 2 ore di default
  const [feeling, setFeeling] = useState('Brillo Felice');
  
  // Lista complessiva dei drink (calcolata in automatico)
  const [loggedDrinks, setLoggedDrinks] = useState([]);
  
  // Drink generici non associati ad una tappa
  const [generalDrinks, setGeneralDrinks] = useState([
    { name: PRESET_DRINKS[0].name, qty: 1, abv: PRESET_DRINKS[0].abv, units: PRESET_DRINKS[0].units }
  ]);
  
  // Drink associati alle tappe del percorso
  const [waypointDrinks, setWaypointDrinks] = useState({}); // { [wpName]: [ { name, qty, abv, units } ] }

  // Sincronizza loggedDrinks sommando generici e tappe
  useEffect(() => {
    const flatWpDrinks = Object.values(waypointDrinks).flat();
    const merged = {};
    [...generalDrinks, ...flatWpDrinks].forEach(d => {
      if (!merged[d.name]) {
        merged[d.name] = { ...d };
      } else {
        merged[d.name].qty += d.qty;
      }
    });
    setLoggedDrinks(Object.values(merged));
  }, [generalDrinks, waypointDrinks]);
  
  // Drink personalizzati caricati dal database
  const [customPresets, setCustomPresets] = useState([]);
  
  // Stato per taggare gli amici
  const [friendName, setFriendName] = useState('');
  const [taggedFriends, setTaggedFriends] = useState([]);
  const [friendSearchResults, setFriendSearchResults] = useState([]);

  // Nuovi stati per localizzazione e media
  const [location, setLocation] = useState(null);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationResults, setLocationResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]); // Array di { type, name, url, size }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Stati per gestire l'inizio della sessione da un percorso
  const [activeRoute, setActiveRoute] = useState(null);
  const [visitedWaypoints, setVisitedWaypoints] = useState([]);

  const loadCustomDrinks = async () => {
    try {
      const drinks = await db.getCustomDrinks();
      setCustomPresets(drinks);
    } catch (err) {
      console.error("Errore nel caricamento dei drink personalizzati:", err);
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const user = await db.getCurrentUser();
      if (!user) {
        router.push('/auth');
      } else {
        setCurrentUser(user);
        loadCustomDrinks();

        // Controlla se è stato passato un routeId per iniziare una sessione da percorso
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const rId = params.get('routeId');
          if (rId) {
            try {
              const route = await db.getRoute(rId);
              if (route) {
                setActiveRoute(route);
                setTitle(`Pub Crawl: ${route.name} 🍻`);
                setDescription(`Ho completato le tappe del percorso: "${route.name}".`);
                // Pre-imposta tutte le tappe come visitate di default
                setVisitedWaypoints(route.waypoints || []);
              }
            } catch (err) {
              console.error("Errore nel recupero del percorso:", err);
            }
          }
        }
      }
    };
    checkUser();
  }, [router]);

  // Calcola le unità alcoliche totali in tempo reale
  const totalUnits = loggedDrinks.reduce((acc, drink) => {
    return acc + (drink.units * drink.qty);
  }, 0).toFixed(1);

  const handleAddPresetDrink = (preset) => {
    const existingIdx = generalDrinks.findIndex(d => d.name === preset.name);
    if (existingIdx > -1) {
      const updated = [...generalDrinks];
      updated[existingIdx].qty += 1;
      setGeneralDrinks(updated);
    } else {
      setGeneralDrinks([...generalDrinks, { name: preset.name, qty: 1, abv: preset.abv, units: preset.units }]);
    }
  };

  const handleUpdateQty = (index, increment) => {
    const updated = [...generalDrinks];
    updated[index].qty += increment;
    if (updated[index].qty <= 0) {
      updated.splice(index, 1);
    }
    setGeneralDrinks(updated);
  };

  const handleCustomDrinkAdd = async (e) => {
    e.preventDefault();
    const name = e.target.customName.value;
    const abv = parseFloat(e.target.customAbv.value || 5);
    const volume = parseFloat(e.target.customVolume.value || 330);
    const category = e.target.customCategory?.value || 'Custom';
    
    if (!name) return;

    try {
      const newDrink = await db.addCustomDrink({
        name,
        abv,
        volumeMl: volume,
        category
      });
      
      // Ricarica la lista globale dei drink personalizzati
      await loadCustomDrinks();
      
      // Aggiungi alla sessione corrente
      const existingIdx = generalDrinks.findIndex(d => d.name === newDrink.name);
      if (existingIdx > -1) {
        const updated = [...generalDrinks];
        updated[existingIdx].qty += 1;
        setGeneralDrinks(updated);
      } else {
        setGeneralDrinks([...generalDrinks, { name: newDrink.name, qty: 1, abv: newDrink.abv, units: newDrink.units }]);
      }
      
      e.target.reset();
    } catch (err) {
      console.error(err);
      setError("Impossibile creare e salvare il drink personalizzato.");
    }
  };

  const handleAddWaypointDrink = (wpName, preset) => {
    const currentWpDrinks = waypointDrinks[wpName] || [];
    const existingIdx = currentWpDrinks.findIndex(d => d.name === preset.name);
    let updatedWpDrinks;
    if (existingIdx > -1) {
      updatedWpDrinks = [...currentWpDrinks];
      updatedWpDrinks[existingIdx].qty += 1;
    } else {
      updatedWpDrinks = [...currentWpDrinks, { name: preset.name, qty: 1, abv: preset.abv, units: preset.units }];
    }
    setWaypointDrinks({
      ...waypointDrinks,
      [wpName]: updatedWpDrinks
    });
  };

  const handleUpdateWaypointQty = (wpName, drinkName, increment) => {
    const currentWpDrinks = waypointDrinks[wpName] || [];
    const existingIdx = currentWpDrinks.findIndex(d => d.name === drinkName);
    if (existingIdx === -1) return;
    
    let updatedWpDrinks = [...currentWpDrinks];
    updatedWpDrinks[existingIdx].qty += increment;
    if (updatedWpDrinks[existingIdx].qty <= 0) {
      updatedWpDrinks.splice(existingIdx, 1);
    }
    setWaypointDrinks({
      ...waypointDrinks,
      [wpName]: updatedWpDrinks
    });
  };

  const handleFriendSearchChange = async (val) => {
    setFriendName(val);
    if (!val.trim()) {
      setFriendSearchResults([]);
      return;
    }
    try {
      const results = await db.searchProfiles(val);
      setFriendSearchResults(results);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectFriend = (user) => {
    const nameToAdd = `${user.display_name} (@${user.username})`;
    if (!taggedFriends.includes(nameToAdd)) {
      setTaggedFriends([...taggedFriends, nameToAdd]);
    }
    setFriendName('');
    setFriendSearchResults([]);
  };

  const handleAddFriend = (e) => {
    e.preventDefault();
    if (friendName.trim() && !taggedFriends.includes(friendName.trim())) {
      setTaggedFriends([...taggedFriends, friendName.trim()]);
      setFriendName('');
      setFriendSearchResults([]);
    }
  };

  const handleRemoveFriend = (name) => {
    setTaggedFriends(taggedFriends.filter(f => f !== name));
  };

  const handleLocationSearch = async (e) => {
    e.preventDefault();
    if (!locationSearchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationSearchQuery)}&limit=5`);
      const data = await response.json();
      setLocationResults(data.map(item => ({
        name: item.display_name.split(',')[0],
        address: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      })));
    } catch (err) {
      console.error("Errore nella ricerca del bar:", err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleMediaUpload = (e) => {
    const files = Array.from(e.target.files);
    const newMedia = [];

    for (let file of files) {
      // Limite dimensione: 10MB per foto/audio, 50MB per video
      const isVideo = file.type.startsWith('video/');
      const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024; // 50MB o 10MB
      
      if (file.size > maxSize) {
        setError(`Il file ${file.name} supera il limite massimo di dimensione (${isVideo ? '50MB' : '10MB'})!`);
        return;
      }

      let type = 'image';
      if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      // Mock URL per simulazione upload client-side
      const url = URL.createObjectURL(file);
      newMedia.push({
        type,
        name: file.name,
        url,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB'
      });
    }

    setMediaFiles(prev => [...prev, ...newMedia]);
    setError('');
  };

  const handleRemoveMedia = (idx) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const calculatedBac = db.calculateBAC(totalUnits, duration);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loggedDrinks.length === 0) {
      setError("Inserisci almeno un drink consumato!");
      return;
    }

    setLoading(true);
    setError('');

    let finalDescription = description;
    if (activeRoute) {
      let visitedSummary = '';
      activeRoute.waypoints.forEach((wp, i) => {
        const isVisited = visitedWaypoints.some(v => v.name === wp.name && Math.abs(v.lat - wp.lat) < 0.0001);
        if (isVisited) {
          const wpDr = waypointDrinks[wp.name] || [];
          const drinksStr = wpDr.length > 0 
            ? wpDr.map(d => `${d.qty}x ${d.name}`).join(', ') 
            : 'Check-in (nessun drink registrato)';
          visitedSummary += `📍 Tappa ${i + 1}: ${wp.name} — ${drinksStr}\n`;
        }
      });
      finalDescription += `\n\n🛣️ Percorso completato: ${activeRoute.name}\n${visitedSummary}`;
    }

    const activityData = {
      title: title || 'Aperitivo Strabar 🍻',
      description: finalDescription,
      duration,
      feeling,
      drinks: loggedDrinks,
      total_units: totalUnits,
      drank_with: taggedFriends,
      location: location,
      bac_level: calculatedBac,
      media: mediaFiles.map(m => ({ type: m.type, name: m.name, url: m.url }))
    };

    try {
      await db.createActivity(activityData);
      router.push('/');
    } catch (err) {
      setError(err.message || "Impossibile salvare l'attività.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Beer size={32} color="var(--primary)" fill="var(--primary)" />
        Registra una Sessione Alcolica
      </h1>
      <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '30px' }}>
        Tieni traccia delle tue bevute, tagga gli amici e calcola le tue statistiche, proprio come faresti con un allenamento.
      </p>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--error)', color: '#FF7D7D', padding: '12px 16px', borderRadius: 'var(--radius)', fontSize: '14px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <div className="log-grid">
        {/* Colonna Sinistra: Modulo principale */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {activeRoute && (
            <div className="card" style={{ border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255,94,0,0.05) 100%)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#FFF', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🗺️ Percorso Attivo: {activeRoute.name}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '15px' }}>
                Registra i drink consumati a ciascuna tappa nell&apos;ordine del tour. Spunta la tappa per fare check-in.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {activeRoute.waypoints?.map((wp, idx) => {
                  const isVisited = visitedWaypoints.some(v => v.name === wp.name && Math.abs(v.lat - wp.lat) < 0.0001);
                  const wpDr = waypointDrinks[wp.name] || [];
                  
                  return (
                    <div
                      key={idx}
                      style={{
                        background: isVisited ? 'rgba(255, 94, 0, 0.04)' : 'var(--bg-input-dark)',
                        border: isVisited ? '1px solid var(--primary)' : '1px solid var(--border-dark)',
                        padding: '15px',
                        borderRadius: '12px',
                        transition: 'all 0.2s'
                      }}
                    >
                      {/* Intestazione Tappa */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: isVisited ? '12px' : '0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ 
                            background: isVisited ? 'var(--primary)' : 'rgba(255,255,255,0.05)', 
                            color: isVisited ? '#FFF' : 'var(--text-dark-secondary)', 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '50%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: '12px', 
                            fontWeight: '800' 
                          }}>
                            {idx + 1}
                          </span>
                          <div>
                            <strong style={{ fontSize: '15px', color: '#FFF', display: 'block' }}>{wp.name}</strong>
                          </div>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={isVisited}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setVisitedWaypoints([...visitedWaypoints, wp]);
                              } else {
                                setVisitedWaypoints(visitedWaypoints.filter(v => v.name !== wp.name));
                                setWaypointDrinks(prev => {
                                  const updated = { ...prev };
                                  delete updated[wp.name];
                                  return updated;
                                });
                              }
                            }}
                            style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '13px', fontWeight: '700', color: isVisited ? 'var(--primary)' : 'var(--text-dark-secondary)' }}>
                            {isVisited ? 'Visitata ✓' : 'Fai Check-in'}
                          </span>
                        </label>
                      </div>

                      {/* Drink Sezione per Tappa Attiva */}
                      {isVisited && (
                        <div style={{ borderTop: '1px dashed var(--border-dark)', paddingTop: '12px', marginTop: '10px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '8px' }}>
                            Aggiungi Drink in questa tappa:
                          </span>
                            {/* Quick preset buttons for waypoints */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                            {[
                              { label: '🍹 Spritz', name: 'Spritz (Campari/Aperol/Select)', abv: 11, units: 1.3 },
                              { label: '🍺 Birra', name: 'Birra Chiara Media', abv: 5, units: 1.6 },
                              { label: '🍷 Vino', name: 'Calice Vino (Rosso/Bianco/Prosecco)', abv: 12.5, units: 1.3 },
                              { label: '🥃 Shot', name: 'Shot (Tequila/Rhum/Chupito)', abv: 40, units: 1.3 }
                            ].map((preset, pIdx) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => handleAddWaypointDrink(wp.name, preset)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '15px' }}
                              >
                                {preset.label}
                              </button>
                            ))}
                            
                            <select
                              onChange={(e) => {
                                const selectedName = e.target.value;
                                if (!selectedName) return;
                                const selectedPreset = [...PRESET_DRINKS, ...customPresets].find(d => d.name === selectedName);
                                if (selectedPreset) {
                                  handleAddWaypointDrink(wp.name, selectedPreset);
                                }
                                e.target.value = ''; // Resetta
                              }}
                              style={{
                                background: 'var(--bg-input-dark)',
                                border: '1px solid var(--border-dark)',
                                color: '#FFF',
                                padding: '5px 10px',
                                borderRadius: '15px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                outline: 'none'
                              }}
                            >
                              <option value="">+ Altro...</option>
                              <optgroup label="Standard Presets">
                                {PRESET_DRINKS.map((d, dIdx) => (
                                  <option key={`preset-${dIdx}`} value={d.name}>{d.name} ({d.abv}%)</option>
                                ))}
                              </optgroup>
                              {customPresets.length > 0 && (
                                <optgroup label="I tuoi Drink Personalizzati">
                                  {customPresets.map((d, dIdx) => (
                                    <option key={`custom-${dIdx}`} value={d.name}>{d.name} ({d.abv}%)</option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>

                          {/* List of drinks registered at this waypoint */}
                          {wpDr.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {wpDr.map((drink, dIdx) => (
                                <div
                                  key={dIdx}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: 'rgba(255,255,255,0.02)',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.03)'
                                  }}
                                >
                                  <span style={{ fontSize: '13px', color: '#FFF' }}>
                                    {drink.name} <span style={{ color: 'var(--primary)', fontWeight: '700' }}>x{drink.qty}</span>
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateWaypointQty(wp.name, drink.name, -1)}
                                      style={{ width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', border: 'none' }}
                                    >
                                      <Minus size={10} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateWaypointQty(wp.name, drink.name, 1)}
                                      style={{ width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', border: 'none' }}
                                    >
                                      <Plus size={10} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', fontStyle: 'italic' }}>
                              Nessun drink registrato ancora per questa tappa.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
              Dettagli Attività
            </h3>
            
            <div className="form-group">
              <label className="form-label">Titolo Bevuta</label>
              <input
                type="text"
                className="form-control"
                placeholder="es. Aperitivo Ignorante, Terzo Tempo Calcetto"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Note / Descrizione della serata</label>
              <textarea
                className="form-control"
                placeholder="Racconta com'è andata la serata, cosa hai mangiato, aneddoti divertenti..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Durata (minuti)</label>
                <div style={{ position: 'relative' }}>
                  <Clock size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-dark-secondary)' }} />
                  <input
                    type="number"
                    className="form-control"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                    style={{ paddingLeft: '40px' }}
                    min={1}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Stato d&apos;animo / Livello</label>
                <select
                  className="form-control"
                  value={feeling}
                  onChange={(e) => setFeeling(e.target.value)}
                  required
                >
                  <option value="Sobrio">Sobrio / Autista</option>
                  <option value="Allegro">Allegro</option>
                  <option value="Brillo Felice">Brillo Felice</option>
                  <option value="Intenditore">Intenditore di Cantina</option>
                  <option value="Molto Caldo">Molto Caldo 🔥</option>
                  <option value="Pieno raso">Pieno Raso 💀</option>
                  <option value="Postumi Assicurati">Postumi Assicurati 🤕</option>
                </select>
              </div>
            </div>
          </div>

          {/* NUOVO CARD: RICERCA E LOCALIZZAZIONE BAR */}
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={18} color="var(--primary)" />
              Presso (Locale / Bar)
            </h3>
            
            {location ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 94, 0, 0.08)', border: '1px dashed var(--primary)', padding: '12px 16px', borderRadius: '8px', marginBottom: '10px' }}>
                <div>
                  <strong style={{ color: '#FFF' }}>📍 {location.name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>{location.address}</div>
                </div>
                <button type="button" onClick={() => setLocation(null)} style={{ color: 'var(--error)', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}>Rimuovi</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Cerca il nome del bar (es. Cantina Do Mori)..."
                    value={locationSearchQuery}
                    onChange={(e) => setLocationSearchQuery(e.target.value)}
                  />
                  <button type="button" onClick={handleLocationSearch} className="btn btn-secondary" style={{ padding: '0 20px' }} disabled={searchLoading}>
                    {searchLoading ? 'Cerca...' : 'Cerca'}
                  </button>
                </div>

                {locationResults.length > 0 && (
                  <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {locationResults.map((res, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setLocation(res);
                          setLocationResults([]);
                          setLocationSearchQuery('');
                        }}
                        style={{ textAlign: 'left', padding: '10px 15px', borderBottom: idx < locationResults.length - 1 ? '1px solid var(--border-dark)' : 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '2px' }}
                      >
                        <strong style={{ fontSize: '14px', color: '#FFF' }}>{res.name}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{res.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* NUOVO CARD: ALLEGATI MULTIMEDIALI (FOTO, VIDEO, AUDIO) */}
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Camera size={18} color="var(--secondary)" />
              Foto, Video e Audio della sessione
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '15px' }}>
              Carica foto e registrazioni vocali dell&apos;impresa. Limiti: <strong>10MB</strong> per immagini/audio, <strong>50MB</strong> per file video.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="file"
                  accept="image/*,video/*,audio/*"
                  onChange={handleMediaUpload}
                  multiple
                  style={{ display: 'none' }}
                  id="media-file-input"
                />
                <label
                  htmlFor="media-file-input"
                  className="btn btn-secondary"
                  style={{ width: '100%', border: '1px dashed var(--border-dark)', background: 'rgba(255,255,255,0.01)', padding: '20px', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
                >
                  <div style={{ display: 'flex', gap: '10px', color: 'var(--primary)' }}>
                    <Camera size={20} />
                    <Video size={20} />
                    <Mic size={20} />
                  </div>
                  <strong style={{ fontSize: '14px', color: '#FFF' }}>Seleziona allegati multimediali</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Trascina o clicca per caricare file</span>
                </label>
              </div>

              {mediaFiles.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                  {mediaFiles.map((media, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '10px', position: 'relative', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveMedia(idx)}
                        style={{ position: 'absolute', top: '4px', right: '6px', color: 'var(--error)', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ×
                      </button>
                      <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--primary)', marginTop: '8px' }}>
                        {media.type === 'video' ? <Video size={24} /> : media.type === 'audio' ? <Volume2 size={24} /> : <Camera size={24} />}
                      </div>
                      <div style={{ fontSize: '11px', color: '#FFF', fontWeight: '600', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', padding: '0 4px' }}>
                        {media.name}
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-dark-secondary)' }}>
                        {media.size}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sezione Selettore Drink */}
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
              {activeRoute ? 'Drink Extra / Sessione Generale 🍹' : 'Drink Consumati 🍹'}
            </h3>

            {/* List of current session's logged drinks */}
            {((activeRoute ? generalDrinks : loggedDrinks).length === 0) ? (
              <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed var(--border-dark)', marginBottom: '20px' }}>
                <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>
                  {activeRoute ? 'Nessun drink extra aggiunto. Usa la sezione del percorso o i preset.' : 'Nessun drink aggiunto ancora. Seleziona dai preset qui a destra.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                {(activeRoute ? generalDrinks : loggedDrinks).map((drink, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', background: 'var(--bg-input-dark)', borderRadius: 'var(--radius)', border: '1px solid var(--border-dark)' }}>
                    <div>
                      <strong style={{ fontSize: '15px' }}>{drink.name}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
                        Gradazione: {drink.abv}% | Unità: {(drink.units * drink.qty).toFixed(1)} U.A.
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <button type="button" onClick={() => handleUpdateQty(idx, -1)} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                        <Minus size={14} />
                      </button>
                      <strong style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{drink.qty}</strong>
                      <button type="button" onClick={() => handleUpdateQty(idx, 1)} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Custom Drink Add Form */}
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-dark-secondary)', marginBottom: '10px', textTransform: 'uppercase' }}>Aggiungi Drink Personalizzato</h4>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
              <form onSubmit={handleCustomDrinkAdd} className="custom-drink-grid">
                <div>
                  <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Nome Drink</label>
                  <input name="customName" type="text" className="form-control" placeholder="es. Grappa" style={{ height: '38px', fontSize: '13px' }} required />
                </div>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', fontWeight: '600' }}>ABV %</label>
                  <input name="customAbv" type="number" step="0.1" className="form-control" placeholder="40" style={{ height: '38px', fontSize: '13px' }} required />
                </div>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Vol (ml)</label>
                  <input name="customVolume" type="number" className="form-control" placeholder="40" style={{ height: '38px', fontSize: '13px' }} required />
                </div>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Categoria</label>
                  <select name="customCategory" className="form-control" style={{ height: '38px', fontSize: '13px', padding: '0 8px' }} required>
                    <option value="Aperitivo">Aperitivo</option>
                    <option value="Birra">Birra</option>
                    <option value="Vino">Vino</option>
                    <option value="Superalcolico">Superalcolico</option>
                    <option value="Custom">Altro</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-secondary" style={{ height: '38px', padding: '0 12px', fontSize: '13px' }}>
                  Aggiungi
                </button>
              </form>
            </div>
          </div>

          {/* Sezione Compagnia / Tag Amici */}
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
              Ha bevuto con...
            </h3>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Users size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-dark-secondary)' }} />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Cerca amici o inserisci un nome..."
                  value={friendName}
                  onChange={(e) => handleFriendSearchChange(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                />

                {/* Dropdown dei risultati di ricerca amici */}
                {friendSearchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1d2e', border: '1px solid var(--border-dark)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                    {friendSearchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectFriend(user)}
                        style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-dark)', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', cursor: 'pointer', transition: 'background 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,94,0,0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div className="activity-avatar" style={{ width: '24px', height: '24px', fontSize: '10px' }}>
                          {user.display_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '13px', color: '#FFF', display: 'block' }}>{user.display_name}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>@{user.username}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={handleAddFriend} className="btn btn-secondary" style={{ borderRadius: 'var(--radius)' }}>
                Tagga
              </button>
            </div>

            {taggedFriends.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {taggedFriends.map((friend, idx) => (
                  <span key={idx} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-dark)', padding: '6px 12px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '500' }}>
                    {friend}
                    <button type="button" onClick={() => handleRemoveFriend(friend)} style={{ cursor: 'pointer', display: 'inline-flex', color: 'var(--error)' }}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '16px', borderRadius: '30px', fontSize: '18px' }} disabled={loading}>
            <Save size={18} /> {loading ? 'Salvataggio...' : 'Salva Attività su Strabar'}
          </button>
        </form>

        {/* Colonna Destra: Quick presets & Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Calcolatore Live Stats (Strava Style) */}
          <div className="card" style={{ border: '2px solid var(--primary)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '15px', color: 'var(--primary)' }}>
              Live Stats 📊
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>
                  Stima Unità Alcoliche (U.A.)
                </span>
                <div style={{ fontSize: '36px', fontWeight: '800', color: '#FFF' }}>
                  {totalUnits}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                  1 Unità Alcolica (U.A.) corrisponde a circa 10 grammi di alcol puro.
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '15px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>
                  Intensità Sforzo (Stima BAC)
                </span>
                <div style={{ fontSize: '16px', fontWeight: '700', marginTop: '5px', color: parseFloat(totalUnits) > 5 ? 'var(--error)' : parseFloat(totalUnits) > 2.5 ? 'var(--primary)' : 'var(--success)' }}>
                  {parseFloat(totalUnits) === 0 ? 'Sobrio 🟢' : parseFloat(totalUnits) < 2.5 ? 'Leggero (Brillo) 🟡' : parseFloat(totalUnits) < 5 ? 'Medio (Caldo) 🟠' : 'Massimo Sforzo (Pieno) 🔴'}
                </div>
              </div>
            </div>
          </div>

          {/* Preset dei Drink Comuni */}
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px' }}>
              Drink Comuni 🍺
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '15px' }}>
              Clicca per aggiungere istantaneamente un drink alla tua sessione.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {PRESET_DRINKS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddPresetDrink(preset)}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: '13px', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Beer size={14} color="var(--primary)" />
                    <div>
                      <strong>{preset.name}</strong>
                      <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{preset.category} | {preset.volumeMl}ml</div>
                    </div>
                  </div>
                  <span style={{ background: 'rgba(255, 94, 0, 0.1)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '10px', fontWeight: '700', fontSize: '11px' }}>
                    +{preset.units}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Preset dei Drink Personalizzati degli Utenti */}
          {customPresets.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(255, 176, 0, 0.2)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Drink Personalizzati 🧪
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '15px' }}>
                Drink aggiunti in autonomia dagli atleti della community.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {customPresets.map((preset, idx) => (
                  <button
                    key={preset.id || idx}
                    type="button"
                    onClick={() => handleAddPresetDrink(preset)}
                    className="btn btn-secondary"
                    style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: '13px', textAlign: 'left' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Beer size={14} color="var(--secondary)" />
                      <div>
                        <strong>{preset.name}</strong>
                        <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{preset.category} | {preset.volumeMl}ml ({preset.abv}%)</div>
                      </div>
                    </div>
                    <span style={{ background: 'rgba(255, 176, 0, 0.1)', color: 'var(--secondary)', padding: '2px 8px', borderRadius: '10px', fontWeight: '700', fontSize: '11px' }}>
                      +{preset.units}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
