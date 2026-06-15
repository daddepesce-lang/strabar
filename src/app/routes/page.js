'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Map, Plus, Save, Award, MapPin, Footprints, AlertTriangle, HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default function RoutesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  // Stati per la creazione di un nuovo percorso (Premium)
  const [isCreating, setIsCreating] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteDesc, setNewRouteDesc] = useState('');
  const [newRouteWaypoints, setNewRouteWaypoints] = useState([]);
  
  // Referenze per Leaflet
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await db.getCurrentUser();
        setCurrentUser(user);
        
        const data = await db.getRoutes();
        setRoutes(data);
        
        // Se ci sono percorsi, seleziona il primo di default
        if (data.length > 0) {
          setSelectedRoute(data[0]);
        }
      } catch (err) {
        console.error("Errore caricamento percorsi:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Inizializza la mappa Leaflet
  useEffect(() => {
    if (loading || typeof window === 'undefined') return;

    // Carica Leaflet dinamicamente lato client
    const initLeaflet = async () => {
      const L = await import('leaflet');
      
      // Risolve problema delle icone di default in Next.js/Webpack
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mapInstance.current) {
        // Inizializza mappa centrata su Venezia (patria dei bacari!)
        mapInstance.current = L.map('map-container').setView([45.4382, 12.3353], 14);

        // Tile di stile scuro ed elegante (CartoDB Dark Matter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 20
        }).addTo(mapInstance.current);

        // Listener per click sulla mappa durante la creazione
        mapInstance.current.on('click', (e) => {
          // Se stiamo creando e l'utente è Premium
          if (isCreating) {
            const { lat, lng } = e.latlng;
            const barName = prompt("Inserisci il nome del Bar / Osteria per questa tappa:");
            if (barName) {
              setNewRouteWaypoints(prev => [
                ...prev,
                { name: barName, lat, lng, note: 'Tappa aggiunta sulla mappa.' }
              ]);
            }
          }
        });
      }
    };

    initLeaflet();

    return () => {
      // Pulizia eventuale all'unmount
    };
  }, [loading, isCreating]);

  // Gestisce l'aggiornamento della visualizzazione della mappa al variare dei waypoint
  useEffect(() => {
    if (typeof window === 'undefined' || !mapInstance.current) return;
    
    const updateMapObjects = async () => {
      const L = await import('leaflet');

      // Rimuovi vecchi marker
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // Rimuovi vecchia linea
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      const activeWaypoints = isCreating ? newRouteWaypoints : (selectedRoute?.waypoints || []);
      if (activeWaypoints.length === 0) return;

      const coords = [];

      // Aggiungi nuovi marker
      activeWaypoints.forEach((wp, idx) => {
        const marker = L.marker([wp.lat, wp.lng])
          .addTo(mapInstance.current)
          .bindPopup(`<strong>Tappa ${idx + 1}: ${wp.name}</strong><br/>${wp.note || ''}`);
        
        markersRef.current.push(marker);
        coords.push([wp.lat, wp.lng]);
      });

      // Disegna linea di collegamento (Giro dei Bar)
      if (coords.length > 1) {
        polylineRef.current = L.polyline(coords, {
          color: '#FF5E00',
          weight: 4,
          dashArray: '5, 10',
          opacity: 0.8
        }).addTo(mapInstance.current);

        // Zoomma la mappa per includere tutti i marker
        mapInstance.current.fitBounds(L.featureGroup(markersRef.current).getBounds(), { padding: [50, 50] });
      } else if (coords.length === 1) {
        mapInstance.current.setView(coords[0], 15);
      }
    };

    updateMapObjects();
  }, [selectedRoute, newRouteWaypoints, isCreating]);

  const handleSelectRoute = (route) => {
    setIsCreating(false);
    setSelectedRoute(route);
  };

  const handleStartCreation = () => {
    if (!currentUser) {
      router.push('/auth');
      return;
    }
    if (!currentUser.is_premium) {
      // Se non è premium, mostra il checkout o blocca
      return;
    }
    setIsCreating(true);
    setNewRouteWaypoints([]);
    setNewRouteName('');
    setNewRouteDesc('');
  };

  const handleSaveRoute = async () => {
    if (newRouteWaypoints.length < 2) {
      alert("Aggiungi almeno 2 tappe sulla mappa cliccando nei punti desiderati!");
      return;
    }
    if (!newRouteName.trim()) {
      alert("Inserisci un nome per questo tour!");
      return;
    }

    try {
      const saved = await db.createRoute({
        name: newRouteName,
        description: newRouteDesc,
        waypoints: newRouteWaypoints,
        is_premium: false // I percorsi creati dagli utenti Premium sono salvati
      });

      // Aggiorna lista e seleziona quello creato
      const updatedList = await db.getRoutes();
      setRoutes(updatedList);
      setSelectedRoute(saved);
      setIsCreating(false);
    } catch (err) {
      console.error(err);
      alert("Impossibile salvare il percorso.");
    }
  };

  // Calcola distanza totale del percorso corrente (approssimata in km)
  const calculateTotalDistance = (waypoints) => {
    if (!waypoints || waypoints.length < 2) return 0;
    
    // Formula di Haversine per distanza geodetica
    const toRad = (x) => (x * Math.PI) / 180;
    let total = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const lon1 = waypoints[i].lng;
      const lat1 = waypoints[i].lat;
      const lon2 = waypoints[i + 1].lng;
      const lat2 = waypoints[i + 1].lat;

      const R = 6371; // km
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      total += R * c;
    }

    return total.toFixed(2);
  };

  const currentActiveWaypoints = isCreating ? newRouteWaypoints : (selectedRoute?.waypoints || []);
  const routeDistance = calculateTotalDistance(currentActiveWaypoints);
  // Stima tempo di camminata (velocità media pedonale 4.5 km/h)
  const walkingTime = Math.round((routeDistance / 4.5) * 60);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 'bold' }}>
          Configurando i navigatori... 🗺️
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Map size={32} color="var(--primary)" />
            Pianificatore Bacaro Tour 🗺️
          </h1>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px' }}>
            Visualizza itinerari esistenti o crea la tua mappa pub crawl (Bacaro Tour) con distanze e indicazioni.
          </p>
        </div>
        
        <div>
          {isCreating ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setIsCreating(false)} className="btn btn-secondary" style={{ borderRadius: '20px' }}>
                Annulla
              </button>
              <button onClick={handleSaveRoute} className="btn btn-primary" style={{ borderRadius: '20px' }}>
                <Save size={16} /> Salva Percorso
              </button>
            </div>
          ) : (
            <button 
              onClick={handleStartCreation} 
              className={`btn ${currentUser?.is_premium ? 'btn-primary' : 'btn-premium'}`}
              style={{ borderRadius: '20px' }}
            >
              <Plus size={16} /> Crea Nuovo Itinerario
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '30px' }}>
        {/* Colonna Sinistra: Lista Percorsi / Form Creazione */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Sezione Creazione (Solo se Premium ed isCreating è vero) */}
          {isCreating && currentUser?.is_premium && (
            <div className="card" style={{ border: '1px solid var(--primary)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', color: 'var(--primary)' }}>
                Nuovo Percorso
              </h3>
              
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11px' }}>Nome del Tour</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="es. Tour dei Bacari Rialto"
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  style={{ height: '38px', fontSize: '14px' }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11px' }}>Descrizione</label>
                <textarea
                  className="form-control"
                  placeholder="Inserisci dettagli utili, cicchetti consigliati, prezzi..."
                  value={newRouteDesc}
                  onChange={(e) => setNewRouteDesc(e.target.value)}
                  rows={3}
                  style={{ fontSize: '13px' }}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '15px', marginTop: '15px' }}>
                <span style={{ fontSize: '12px', display: 'flex', items: 'center', gap: '6px', color: 'var(--text-dark-secondary)', fontWeight: '600' }}>
                  <HelpCircle size={14} /> ISTRUZIONI:
                </span>
                <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '6px', lineHeight: '1.4' }}>
                  Fai click in qualsiasi punto della mappa a destra per posizionare un marker e aggiungere un bar al tuo itinerario. Aggiungine almeno 2 per tracciare la rotta alcolica!
                </p>
              </div>
            </div>
          )}

          {/* Lista itinerari salvati */}
          {!isCreating && (
            <div className="card">
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px' }}>
                Tour Disponibili
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {routes.map((route) => {
                  const isSelected = selectedRoute?.id === route.id;
                  return (
                    <button
                      key={route.id}
                      onClick={() => handleSelectRoute(route)}
                      className="btn btn-secondary"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '14px',
                        background: isSelected ? 'rgba(255, 94, 0, 0.08)' : 'var(--bg-input-dark)',
                        borderColor: isSelected ? 'var(--primary)' : 'var(--border-dark)',
                        borderRadius: 'var(--radius)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '6px' }}>
                        <strong style={{ fontSize: '14px', color: '#FFF' }}>{route.name}</strong>
                        {route.is_premium && (
                          <span className="badge-premium" style={{ fontSize: '8px' }}>P</span>
                        )}
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', lineClamp: '2', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {route.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dettagli della rotta attiva (statistiche camminata) */}
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px' }}>
              Statistiche Itinerario 📈
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="var(--primary)" /> Tappe bar
                </span>
                <strong style={{ fontSize: '15px' }}>{currentActiveWaypoints.length}</strong>
              </div>
              <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="var(--primary)" /> Distanza totale
                </span>
                <strong style={{ fontSize: '15px' }}>{routeDistance} km</strong>
              </div>
              <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Footprints size={14} color="var(--primary)" /> Tempo cammino
                </span>
                <strong style={{ fontSize: '15px' }}>~ {walkingTime} min</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Colonna Destra: Mappa Leaflet & Paywall Overlay */}
        <div style={{ position: 'relative' }}>
          <div id="map-container" className="map-container" style={{ height: '550px' }}></div>

          {/* Paywall Overlay: Se non-premium prova a creare */}
          {isCreating && (!currentUser || !currentUser.is_premium) && (
            <div className="paywall-overlay">
              <span className="paywall-badge">Strabar Summit 🏔️</span>
              <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#FFF', marginBottom: '12px' }}>
                Crea i tuoi percorsi personalizzati
              </h2>
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', maxWidth: '420px', marginBottom: '25px', lineHeight: '1.5' }}>
                Il pianificatore di itinerari per Bacaro Tour e pub crawl è una funzionalità esclusiva di Strabar Premium. Ottieni indicazioni precise, distanze e salva i tuoi percorsi.
              </p>
              
              <div style={{ display: 'flex', gap: '15px' }}>
                <button onClick={() => setIsCreating(false)} className="btn btn-secondary">
                  Torna ai percorsi pubblici
                </button>
                <Link href="/premium" className="btn btn-premium">
                  Sblocca con Premium
                </Link>
              </div>
            </div>
          )}

          {/* Didascalia tappe del percorso selezionato o in creazione */}
          {currentActiveWaypoints.length > 0 && (
            <div className="card" style={{ marginTop: '20px', padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Tappe dell&apos;Itinerario:</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '15px' }}>
                {currentActiveWaypoints.map((wp, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', padding: '10px 15px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ background: 'var(--primary)', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '12px' }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wp.name}</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wp.note}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
