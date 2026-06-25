'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Map, Plus, Save, MapPin, Footprints, Search, X, Loader, Beer, Trash2, Edit3, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import RequireAuth from '@/components/RequireAuth';
import { siteUrl } from '@/lib/site';

export default function RoutesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [activeWaypointIndex, setActiveWaypointIndex] = useState(null);
  const [tourTarget, setTourTarget] = useState(2); // drink-target per tappa
  const [tourVisibility, setTourVisibility] = useState('public'); // private | friends | public
  const [startingTour, setStartingTour] = useState(false);
  const [loading, setLoading] = useState(true);

  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState(null); // se valorizzato, stiamo modificando
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteDesc, setNewRouteDesc] = useState('');
  const [newRouteVisibility, setNewRouteVisibility] = useState('public'); // chi vede il percorso salvato
  const [newRouteWaypoints, setNewRouteWaypoints] = useState([]);
  const [deletingRoute, setDeletingRoute] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [routeSearchQuery, setRouteSearchQuery] = useState(''); // Filtro lista itinerari per titolo
  // Filtro lista itinerari per LUOGO + raggio (km): cerca un luogo e mostra
  // solo i percorsi con almeno una tappa entro il raggio scelto.
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeFilter, setPlaceFilter] = useState(null); // { name, lat, lng }
  const [radiusKm, setRadiusKm] = useState(5);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingBars, setIsLoadingBars] = useState(false);
  const [discoveredBars, setDiscoveredBars] = useState([]);
  const [justAdded, setJustAdded] = useState(null); // feedback "tappa aggiunta"

  // Stati per il percorso stradale reale OSRM
  const [travelMode, setTravelMode] = useState('foot'); // 'foot' (a piedi) o 'driving' (in auto)
  const [routeCoordsState, setRouteCoordsState] = useState([]);
  const [osrmDistance, setOsrmDistance] = useState(0);
  const [osrmDuration, setOsrmDuration] = useState(0);

  // Leaflet refs
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);
  const venueMarkersRef = useRef([]);
  const leafletRef = useRef(null);

  // Ref to avoid stale closure in map click handler
  const isCreatingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isCreatingRef.current = isCreating;
  }, [isCreating]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await db.getCurrentUser();
        setCurrentUser(user);
        const data = await db.getRoutes();
        setRoutes(data);

        // Leggi il parametro di condivisione del percorso
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const routeId = params.get('routeId');
          if (routeId) {
            const sharedRoute = await db.getRoute(routeId);
            if (sharedRoute) {
              setSelectedRoute(sharedRoute);
              if (!data.some(r => r.id === sharedRoute.id)) {
                setRoutes(prev => [sharedRoute, ...prev]);
              }
              return;
            }
          }
        }

        // Vista predefinita: la LISTA (nessun percorso pre-selezionato). Il dettaglio
        // si apre cliccando un itinerario (o via ?routeId= condiviso/da evento).
      } catch (err) {
        console.error('Error loading routes:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Haversine distance formula
  const calculateTotalDistance = (waypoints) => {
    if (!waypoints || waypoints.length < 2) return 0;
    const toRad = (x) => (x * Math.PI) / 180;
    let total = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const lon1 = waypoints[i].lng;
      const lat1 = waypoints[i].lat;
      const lon2 = waypoints[i + 1].lng;
      const lat2 = waypoints[i + 1].lat;
      const R = 6371;
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

  // Distanza in km tra due punti (Haversine) — per il filtro "per luogo + raggio".
  const distanceKm = (lat1, lng1, lat2, lng2) => {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Ricerca luogo per il filtro a raggio (debounced). Non aggiungiamo tappe: serve
  // solo a fissare un centro su cui filtrare la lista degli itinerari.
  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2 || (placeFilter && placeFilter.name === q)) {
      setPlaceResults([]); setPlaceSearching(false);
      return;
    }
    setPlaceSearching(true);
    const h = setTimeout(async () => {
      try { setPlaceResults((await db.searchVenues(q) || []).slice(0, 6)); }
      catch { setPlaceResults([]); }
      finally { setPlaceSearching(false); }
    }, 450);
    return () => clearTimeout(h);
  }, [placeQuery, placeFilter]);

  // Initialize Leaflet map
  useEffect(() => {
    if (loading || typeof window === 'undefined') return;

    const initLeaflet = async () => {
      const L = await import('leaflet');
      leafletRef.current = L;

      // Fix default icon issue for Next.js/Webpack
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mapInstance.current) {
        // Start with a world view, then try geolocation
        mapInstance.current = L.map('map-container').setView([20, 0], 3);

        // CartoDB Dark Matter tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 20,
        }).addTo(mapInstance.current);

        // Try user geolocation
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              if (mapInstance.current) {
                mapInstance.current.setView([latitude, longitude], 14);
              }
            },
            () => {
              // Geolocation denied or unavailable — keep world view
            },
            { timeout: 8000, enableHighAccuracy: false }
          );
        }
      }
    };

    initLeaflet();
  }, [loading]);

  // Entrando nel dettaglio/creazione la mappa torna visibile (era nascosta in lista):
  // Leaflet va ridimensionato E reinquadrato sulle tappe, altrimenti la mappa resta
  // centrata altrove (geolocalizzazione) e l'itinerario finisce fuori dalla vista.
  useEffect(() => {
    if (loading || (!selectedRoute && !isCreating) || !mapInstance.current) return;
    const t = setTimeout(() => {
      const map = mapInstance.current;
      const L = leafletRef.current;
      if (!map || !L) return;
      map.invalidateSize();
      const wps = isCreating ? newRouteWaypoints : (selectedRoute?.waypoints || []);
      const pts = wps
        .map((w) => [w.lat, w.lng ?? w.lon])
        .filter(([la, ln]) => la != null && ln != null);
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50] });
      else if (pts.length === 1) map.setView(pts[0], 15);
    }, 120);
    return () => clearTimeout(t);
  }, [selectedRoute, isCreating, loading, newRouteWaypoints]);

  // Tracciato del percorso: linee dritte tra le tappe (in ordine), tratteggiate.
  // NIENTE routing stradale OSRM: su zone come Venezia (canali, ZTL, isole pedonali)
  // il profilo 'driving' restituiva percorsi totalmente sballati ("fuori per fuori").
  // Per la navigazione reale c'è il pulsante "Apri in Google Maps". La distanza qui
  // è quella in linea d'aria tra le tappe (indicativa).
  useEffect(() => {
    const activeWaypoints = isCreating ? newRouteWaypoints : (selectedRoute?.waypoints || []);
    setOsrmDistance(0);
    setOsrmDuration(0);
    if (activeWaypoints.length < 2) {
      setRouteCoordsState([]);
      return;
    }
    setRouteCoordsState(activeWaypoints.map((wp) => [wp.lat, wp.lng ?? wp.lon]));
  }, [newRouteWaypoints, selectedRoute, isCreating, travelMode]);

  // Icona tappa (rossa di default, oro+glow se è la tappa attiva)
  const makeWaypointIcon = (L, idx, active) => {
    const size = active ? 38 : 28;
    const bg = active ? '#DFFF00' : '#EF4444';
    const ring = active ? '3px solid #fff' : '2px solid #fff';
    const glow = active
      ? '0 0 0 4px rgba(223, 255, 0,0.35), 0 2px 10px rgba(0,0,0,0.6)'
      : '0 2px 8px rgba(0,0,0,0.5)';
    return L.divIcon({
      className: 'custom-numbered-marker',
      html: `<div style="background:${bg};color:#fff;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${active ? 15 : 13}px;border:${ring};box-shadow:${glow};transition:all .2s;">${idx + 1}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  };

  // Quando cambia la tappa attiva: evidenziala, centra la mappa e apri il popup
  useEffect(() => {
    if (activeWaypointIndex == null || !mapInstance.current || !leafletRef.current) return;
    const marker = markersRef.current[activeWaypointIndex];
    if (!marker) return;
    markersRef.current.forEach((mk, i) =>
      mk.setIcon(makeWaypointIcon(leafletRef.current, i, i === activeWaypointIndex))
    );
    mapInstance.current.flyTo(marker.getLatLng(), Math.max(mapInstance.current.getZoom(), 16), { duration: 0.6 });
    marker.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWaypointIndex]);

  // Update map markers and polyline when waypoints change
  useEffect(() => {
    if (typeof window === 'undefined' || !mapInstance.current || !leafletRef.current) return;

    const L = leafletRef.current;

    // Remove old tour markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Remove old polyline
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    const activeWaypoints = isCreating ? newRouteWaypoints : (selectedRoute?.waypoints || []);
    if (activeWaypoints.length === 0) return;

    const coords = [];

    activeWaypoints.forEach((wp, idx) => {
      const lng = wp.lng ?? wp.lon;
      if (wp.lat == null || lng == null) return;
      const marker = L.marker([wp.lat, lng], { icon: makeWaypointIcon(L, idx, idx === activeWaypointIndex) })
        .addTo(mapInstance.current)
        .bindPopup(`<strong>Tappa ${idx + 1}: ${wp.name}</strong>${wp.note ? `<br/>${wp.note}` : ''}`);
      marker.on('click', () => setActiveWaypointIndex(idx));

      markersRef.current.push(marker);
      coords.push([wp.lat, lng]);
    });

    // Draw dashed polyline connecting tour stops
    if (routeCoordsState && routeCoordsState.length > 1) {
      mapInstance.current.invalidateSize(); // Corregge dimensioni grigie di Leaflet in React
      polylineRef.current = L.polyline(routeCoordsState, {
        color: '#FF2000',
        weight: 3,
        opacity: 0.8,
        dashArray: '8, 8', // tratteggiata: indica collegamento "in linea d'aria", non stradale
      }).addTo(mapInstance.current);

      mapInstance.current.fitBounds(L.featureGroup(markersRef.current).getBounds(), { padding: [50, 50] });
    } else if (coords.length === 1) {
      mapInstance.current.setView(coords[0], 15);
    }
  }, [selectedRoute, newRouteWaypoints, isCreating, routeCoordsState]);

  // Show discovered bars as venue markers on the map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapInstance.current || !leafletRef.current) return;

    const L = leafletRef.current;

    // Remove old venue markers
    venueMarkersRef.current.forEach((m) => m.remove());
    venueMarkersRef.current = [];

    if (!isCreating || discoveredBars.length === 0) return;

    discoveredBars.forEach((bar) => {
      // Skip bars already in tour
      const alreadyAdded = newRouteWaypoints.some(
        (wp) => Math.abs(wp.lat - bar.lat) < 0.00001 && Math.abs(wp.lng - bar.lon) < 0.00001
      );
      if (alreadyAdded) return;

      const venueIcon = L.divIcon({
        className: 'venue-circle-marker',
        html: `<div style="
          background: #F59E0B;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid #FCD34D;
          box-shadow: 0 0 6px rgba(245,158,11,0.6);
          cursor: pointer;
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const barName = bar.tags?.name || 'Bar senza nome';
      const barType = bar.tags?.amenity === 'pub' ? 'Pub' : bar.tags?.amenity === 'biergarten' ? 'Birreria all\'aperto' : 'Bar';

      // Programmatically create the popup elements to avoid inline script/quote escaping issues
      const container = document.createElement('div');
      container.style.minWidth = '170px';
      container.style.fontFamily = 'inherit';

      const titleEl = document.createElement('strong');
      titleEl.style.fontSize = '14px';
      titleEl.style.color = '#FFF';
      titleEl.style.display = 'block';
      titleEl.textContent = barName;
      container.appendChild(titleEl);

      const typeEl = document.createElement('span');
      typeEl.style.fontSize = '11px';
      typeEl.style.color = '#9ca3af';
      typeEl.style.display = 'block';
      typeEl.style.marginTop = '2px';
      typeEl.textContent = barType;
      container.appendChild(typeEl);

      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Aggiungi al Percorso';
      addBtn.style.marginTop = '8px';
      addBtn.style.background = '#FF2000';
      addBtn.style.color = 'white';
      addBtn.style.border = 'none';
      addBtn.style.padding = '6px 14px';
      addBtn.style.borderRadius = '20px';
      addBtn.style.cursor = 'pointer';
      addBtn.style.fontWeight = '600';
      addBtn.style.fontSize = '12px';
      addBtn.style.width = '100%';
      addBtn.onclick = () => {
        setNewRouteWaypoints((prev) => {
          const alreadyExists = prev.some(
            (wp) => Math.abs(wp.lat - bar.lat) < 0.00001 && Math.abs(wp.lng - bar.lon) < 0.00001
          );
          if (alreadyExists) return prev;
          return [
            ...prev,
            { name: barName, lat: bar.lat, lng: bar.lon, note: `${barType} trovato tramite ricerca` },
          ];
        });
        marker.closePopup();
      };
      container.appendChild(addBtn);

      const mapsLink = document.createElement('a');
      mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(barName + ' ' + (bar.tags?.['addr:city'] || ''))}`;
      mapsLink.target = '_blank';
      mapsLink.rel = 'noopener noreferrer';
      mapsLink.textContent = '🔍 Cerca su Google Maps';
      mapsLink.style.display = 'block';
      mapsLink.style.textAlign = 'center';
      mapsLink.style.marginTop = '6px';
      mapsLink.style.background = '#2a2f42';
      mapsLink.style.color = '#fff';
      mapsLink.style.border = '1px solid #4f5573';
      mapsLink.style.padding = '5px 12px';
      mapsLink.style.borderRadius = '20px';
      mapsLink.style.textDecoration = 'none';
      mapsLink.style.fontWeight = '600';
      mapsLink.style.fontSize = '11px';
      container.appendChild(mapsLink);

      const marker = L.marker([bar.lat, bar.lon], { icon: venueIcon })
        .addTo(mapInstance.current)
        .bindPopup(container);

      venueMarkersRef.current.push(marker);
    });
  }, [discoveredBars, isCreating, newRouteWaypoints]);

  // Global function so popup buttons can call it
  useEffect(() => {
    window.__addBarToTour = (lat, lon, name, type) => {
      if (!isCreatingRef.current) return;
      setNewRouteWaypoints((prev) => {
        const alreadyExists = prev.some(
          (wp) => Math.abs(wp.lat - lat) < 0.00001 && Math.abs(wp.lng - lon) < 0.00001
        );
        if (alreadyExists) return prev;
        return [
          ...prev,
          { name, lat, lng: lon, note: `${type} trovato tramite ricerca`, units: 1.5 },
        ];
      });
      setJustAdded(name);
      setTimeout(() => setJustAdded(null), 2000);
      // Close popup
      if (mapInstance.current) {
        mapInstance.current.closePopup();
      }
    };
    return () => {
      delete window.__addBarToTour;
    };
  }, []);

  // --- Ricerca LOCALE per nome (Nominatim) ---
  // L'utente cerca un bar/pub/osteria per nome e lo aggiunge direttamente come tappa.
  const handleVenueSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=8&addressdetails=1&namedetails=1`
      );
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Nominatim venue search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Centra la mappa su un risultato senza aggiungerlo (per esplorare)
  const handleCenterOnResult = (result) => {
    if (!mapInstance.current) return;
    mapInstance.current.setView([parseFloat(result.lat), parseFloat(result.lon)], 16);
  };

  // Aggiunge un risultato direttamente come tappa del tour
  const handleAddVenue = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const name = result.namedetails?.name || result.display_name.split(',')[0];
    const note = result.display_name.split(',').slice(1, 3).join(',').trim();
    setNewRouteWaypoints((prev) => {
      if (prev.some((wp) => Math.abs(wp.lat - lat) < 0.00001 && Math.abs(wp.lng - lng) < 0.00001)) return prev;
      return [...prev, { name, lat, lng, note, units: 1.5 }];
    });
    if (mapInstance.current) mapInstance.current.setView([lat, lng], 16);
    setJustAdded(name);
    setTimeout(() => setJustAdded(null), 2000);
  };

  // Aggiunge una tappa per INDIRIZZO: quando il locale non compare nella ricerca per nome,
  // scrivi il suo indirizzo (via + civico + città) e lo GEOCODIFICHIAMO per ottenere le
  // coordinate PRECISE — senza usare il GPS. La posizione viene dal geocoding, non dalla mappa.
  const handleAddManualStop = async () => {
    const query = window.prompt('Indirizzo del locale (es. "Calle dei Botteri 1546, Venezia"). Lo cerchiamo sulla mappa per posizionarlo con precisione.');
    if (!query || !query.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=1&addressdetails=1`
      );
      const data = await res.json();
      if (!data || data.length === 0) {
        alert('Indirizzo non trovato. Prova ad aggiungere la città o il civico (es. "Via Roma 10, Padova").');
        return;
      }
      const r = data[0];
      const lat = parseFloat(r.lat);
      const lng = parseFloat(r.lon);
      const label = window.prompt('Nome della tappa (come vuoi che appaia nel tour):', r.display_name.split(',')[0]) || r.display_name.split(',')[0];
      setNewRouteWaypoints((prev) => {
        if (prev.some((wp) => Math.abs(wp.lat - lat) < 0.00001 && Math.abs(wp.lng - lng) < 0.00001)) return prev;
        return [...prev, { name: label.trim(), lat, lng, note: r.display_name.split(',').slice(1, 3).join(',').trim(), units: 1.5 }];
      });
      if (mapInstance.current) mapInstance.current.setView([lat, lng], 17);
      setJustAdded(label.trim());
      setTimeout(() => setJustAdded(null), 2000);
    } catch (err) {
      console.error('Errore geocoding tappa manuale:', err);
      alert('Errore nella ricerca dell\'indirizzo. Riprova.');
    } finally {
      setIsSearching(false);
    }
  };

  // Aggiorna il fabbisogno alcolico (U.A.) di una tappa
  const handleUpdateWaypointUnits = (idx, delta) => {
    setNewRouteWaypoints((prev) =>
      prev.map((wp, i) =>
        i === idx ? { ...wp, units: Math.max(0, parseFloat(((wp.units || 0) + delta).toFixed(1))) } : wp
      )
    );
  };

  // --- Load Bars (Overpass API) ---
  const handleLoadBars = useCallback(async () => {
    if (!mapInstance.current) return;
    setIsLoadingBars(true);
    setDiscoveredBars([]);

    try {
      const bounds = mapInstance.current.getBounds();
      const south = bounds.getSouth().toFixed(6);
      const west = bounds.getWest().toFixed(6);
      const north = bounds.getNorth().toFixed(6);
      const east = bounds.getEast().toFixed(6);

      const query = `[out:json][timeout:10];
(
  node["amenity"="bar"](${south},${west},${north},${east});
  node["amenity"="pub"](${south},${west},${north},${east});
  node["amenity"="biergarten"](${south},${west},${north},${east});
  node["amenity"="nightclub"](${south},${west},${north},${east});
);
out body;`;

      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);

      const data = await res.json();
      const bars = (data.elements || []).filter((el) => el.lat && el.lon);
      setDiscoveredBars(bars);
    } catch (err) {
      console.error('Overpass API error:', err);
    } finally {
      setIsLoadingBars(false);
    }
  }, []);

  // --- Route CRUD ---
  const handleSelectRoute = (route) => {
    setIsCreating(false);
    setSelectedRoute(route);
    setActiveWaypointIndex(null);
    setDiscoveredBars([]);
  };

  // Avvia un Tour guidato: crea una sessione live "modalità percorso" sulla prima tappa
  const handleStartTour = async () => {
    if (!currentUser) { alert('Accedi per avviare un tour.'); return; }
    const stopsRaw = selectedRoute?.waypoints || [];
    if (stopsRaw.length === 0) { alert('Questo percorso non ha tappe.'); return; }
    // Conferma esplicita della privacy scelta (🌍/👥/🔒) prima di avviare il tour.
    const privacyLabels = { public: '🌍 Tutti', friends: '👥 Solo amici', private: '🔒 Privata' };
    if (!window.confirm(`Avvio "${selectedRoute.name}"\nVisibilità della live: ${privacyLabels[tourVisibility] || tourVisibility}.\n\nProcedere? (puoi cambiarla qui sopra prima di avviare)`)) return;
    setStartingTour(true);
    try {
      const active = await db.getActiveSession(currentUser.id);
      if (active) {
        alert('Hai già una sessione live attiva. Chiudila prima di avviare un tour.');
        setStartingTour(false);
        return;
      }
      const stops = stopsRaw.map((w) => ({ name: w.name, lat: w.lat, lng: w.lng ?? w.lon, note: w.note || '' }));
      const first = stops[0];

      // NB: il tour parte SENZA verifica GPS — devi poterlo avviare da casa per ricevere
      // le indicazioni verso la prima tappa. La posizione viene verificata in seguito,
      // quando registri un drink presso una tappa (vedi handleAddDrinkToActiveSession).
      // La prima tappa nasce "non verificata" finché non bevi sul posto.
      await db.createActivity({
        title: `Tour: ${selectedRoute.name}`,
        location: {
          name: first.name,
          address: '',
          lat: first.lat,
          lng: first.lng,
          share: tourVisibility,
          unverified: true,
          tour: {
            route_id: selectedRoute.id,
            route_name: selectedRoute.name,
            target: tourTarget,
            current: 0,
            stops,
            visited: [{ name: first.name, lat: first.lat, lng: first.lng, arrived_at: new Date().toISOString(), drinksAtStart: 0, verified: false }],
          },
        },
        drinks: [],
        is_active: true,
        bac_level: 0,
        total_units: 0,
        duration: 1,
      });
      // Vai alla home con reload COMPLETO: così il pannello live viene caricato subito
      // (router.push non rieseguiva il fetch della sessione attiva se la home era già montata).
      window.location.href = '/';
    } catch (err) {
      alert('Errore nell\'avvio del tour: ' + (err.message || err));
      setStartingTour(false);
    }
  };

  const handleStartCreation = () => {
    if (!currentUser) {
      router.push('/auth');
      return;
    }
    if (!currentUser.is_premium) {
      // Show paywall — set isCreating to trigger overlay
      setIsCreating(true);
      return;
    }
    setIsCreating(true);
    setEditingRouteId(null);
    setSelectedRoute(null);
    setNewRouteWaypoints([]);
    setNewRouteName('');
    setNewRouteDesc('');
    setNewRouteVisibility('public');
    setDiscoveredBars([]);
  };

  // Modifica un percorso esistente (solo il proprietario): pre-carica il form di creazione.
  const handleEditRoute = (route) => {
    setIsCreating(true);
    setEditingRouteId(route.id);
    setSelectedRoute(null);
    setNewRouteName(route.name || '');
    setNewRouteDesc(route.description || '');
    setNewRouteVisibility(route.visibility || 'public');
    setNewRouteWaypoints((route.waypoints || []).map((w) => ({ ...w, lng: w.lng ?? w.lon })));
    setDiscoveredBars([]);
  };

  // Elimina un percorso (solo il proprietario)
  const handleDeleteRoute = async (route) => {
    if (!route) return;
    if (!window.confirm(`Eliminare il percorso "${route.name}"? L'azione è irreversibile.`)) return;
    setDeletingRoute(true);
    try {
      await db.deleteRoute(route.id);
      setRoutes((prev) => prev.filter((r) => r.id !== route.id));
      if (selectedRoute?.id === route.id) setSelectedRoute(null);
      if (editingRouteId === route.id) handleCancelCreation();
    } catch (err) {
      console.error(err);
      alert('Impossibile eliminare il percorso: ' + (err.message || err));
    } finally {
      setDeletingRoute(false);
    }
  };

  const handleCancelCreation = () => {
    setIsCreating(false);
    setEditingRouteId(null);
    setNewRouteWaypoints([]);
    setNewRouteName('');
    setNewRouteDesc('');
    setNewRouteVisibility('public');
    setDiscoveredBars([]);
    setSearchQuery('');
    setSearchResults([]);
    // Torna alla LISTA dopo aver annullato la creazione.
    setSelectedRoute(null);
  };

  const handleSaveRoute = async () => {
    if (newRouteWaypoints.length < 2) {
      alert('Add at least 2 stops to your tour!');
      return;
    }
    if (!newRouteName.trim()) {
      alert('Please enter a name for this tour!');
      return;
    }

    try {
      if (editingRouteId) {
        const updated = await db.updateRoute(editingRouteId, {
          name: newRouteName,
          description: newRouteDesc,
          waypoints: newRouteWaypoints,
          visibility: newRouteVisibility,
        });
        setRoutes((prev) => prev.map((r) => (r.id === editingRouteId ? { ...r, ...updated } : r)));
        setSelectedRoute(updated);
        setIsCreating(false);
        setEditingRouteId(null);
        alert('Itinerario aggiornato!');
      } else {
        const saved = await db.saveRoute(newRouteName, newRouteDesc, newRouteWaypoints, false, newRouteVisibility);
        setRoutes(prev => [saved, ...prev]);
        setSelectedRoute(saved);
        setIsCreating(false);
        alert('Itinerario salvato con successo!');
      }
    } catch (err) {
      console.error(err);
      alert('Impossibile salvare l\'itinerario.');
    }
  };

  const handleRemoveWaypoint = (index) => {
    setNewRouteWaypoints((prev) => prev.filter((_, i) => i !== index));
  };

  // Modalità della pagina: LISTA (nessun percorso aperto) vs DETTAGLIO (percorso selezionato)
  // vs CREAZIONE. In lista mostriamo solo l'elenco a tutta larghezza; il dettaglio (mappa,
  // tappe, statistiche, azioni) si apre cliccando un itinerario.
  const listMode = !isCreating && !selectedRoute;
  const detailMode = !isCreating && !!selectedRoute;

  // Computed values
  const currentActiveWaypoints = isCreating ? newRouteWaypoints : (selectedRoute?.waypoints || []);
  const routeDistance = osrmDistance > 0 ? osrmDistance : parseFloat(calculateTotalDistance(currentActiveWaypoints));
  // Stima indicativa sulla distanza in linea d'aria: ~4,5 km/h a piedi, ~25 km/h in auto
  // (velocità media urbana, soste/traffico inclusi). Per i tempi reali c'è Google Maps.
  const travelSpeedKmh = travelMode === 'foot' ? 4.5 : 25;
  const travelTime = Math.max(1, Math.round((routeDistance / travelSpeedKmh) * 60));
  const routeTotalUnits = currentActiveWaypoints.reduce((s, wp) => s + (parseFloat(wp.units) || 0), 0);

  const filteredRoutes = routes.filter(route => {
    // Filtro per luogo + raggio: tieni i percorsi con almeno una tappa entro il raggio.
    if (placeFilter) {
      const near = (route.waypoints || []).some(wp => {
        const lng = wp.lng ?? wp.lon;
        if (wp.lat == null || lng == null) return false;
        return distanceKm(placeFilter.lat, placeFilter.lng, wp.lat, lng) <= radiusKm;
      });
      if (!near) return false;
    }
    // Filtro per titolo (o descrizione / nome tappa).
    const q = routeSearchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = route.name?.toLowerCase().includes(q);
    const descMatch = route.description?.toLowerCase().includes(q);
    const waypointMatch = route.waypoints?.some(wp =>
      wp.name?.toLowerCase().includes(q) ||
      wp.address?.toLowerCase().includes(q)
    );
    return nameMatch || descMatch || waypointMatch;
  });

  // --- LOADING STATE ---
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
          Caricamento pianificatore tour...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <RequireAuth feature="i percorsi" />;
  }

  // --- RENDER ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Map size={32} color="var(--primary)" />
            Pianificatore Itinerari & Pub Crawl 🗺️
          </h1>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', marginTop: '4px' }}>
            Scopri bar e pub in tutto il mondo e crea il tuo percorso ideale per brindare.
          </p>
        </div>

        <div>
          {isCreating && currentUser?.is_premium ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleCancelCreation} className="btn btn-secondary" style={{ borderRadius: '20px' }}>
                <X size={16} /> Annulla
              </button>
              <button onClick={handleSaveRoute} className="btn btn-primary" style={{ borderRadius: '20px' }}>
                <Save size={16} /> {editingRouteId ? 'Aggiorna Tour' : 'Salva Tour'}
              </button>
            </div>
          ) : (
            !isCreating && (
              <button
                onClick={handleStartCreation}
                className={`btn ${currentUser?.is_premium ? 'btn-primary' : 'btn-premium'}`}
                style={{ borderRadius: '20px' }}
              >
                <Plus size={16} /> Crea Nuovo Itinerario
              </button>
            )
          )}
        </div>
      </div>

      {/* In LISTA il grid diventa a piena larghezza (block) e la colonna mappa è nascosta;
          in DETTAGLIO/CREAZIONE torna a due colonne (sidebar + mappa). */}
      <div className="r-grid-sidebar" style={listMode ? { display: 'block' } : undefined}>
        {/* LEFT SIDEBAR */}
        <div className="routes-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: listMode ? 'none' : 'calc(100vh - 200px)', overflowY: listMode ? 'visible' : 'auto' }}>

          {/* Intestazione dettaglio: torna alla lista + nome/descrizione/autore */}
          {detailMode && (
            <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => { setSelectedRoute(null); setActiveWaypointIndex(null); setDiscoveredBars([]); }} className="action-btn" style={{ fontSize: '13px', width: 'fit-content' }}>
                <ArrowLeft size={15} /> Torna alla lista
              </button>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {selectedRoute?.name}
                {selectedRoute?.user_id === currentUser?.id && (
                  <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '6px', padding: '1px 5px' }}>I MIEI</span>
                )}
              </h2>
              {selectedRoute?.description && (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>{selectedRoute.description}</p>
              )}
              {selectedRoute?.user_id !== currentUser?.id && (selectedRoute?.creator?.display_name || selectedRoute?.creator?.username) && (
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(selectedRoute.creator.display_name || selectedRoute.creator.username).charAt(0).toUpperCase()}
                  </span>
                  Creato da {selectedRoute.creator.display_name || `@${selectedRoute.creator.username}`}
                </span>
              )}
            </div>
          )}

          {/* Tour Details Form (during creation) */}
          {isCreating && currentUser?.is_premium && (
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Beer size={16} color="var(--primary)" /> 1. Dettagli del Tour
              </h3>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ fontSize: '10px' }}>Nome del Tour</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="es. Giro dei Bacari di Venezia"
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  style={{ height: '38px', fontSize: '13px' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '0' }}>
                <label className="form-label" style={{ fontSize: '10px' }}>Descrizione</label>
                <textarea
                  className="form-control"
                  placeholder="Descrivi l'itinerario e i locali consigliati..."
                  value={newRouteDesc}
                  onChange={(e) => setNewRouteDesc(e.target.value)}
                  rows={2}
                  style={{ fontSize: '13px', resize: 'vertical' }}
                />
              </div>
              {/* Chi può vedere questo percorso salvato */}
              <div className="form-group" style={{ marginTop: '12px', marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '10px' }}>Chi può vedere questo itinerario</label>
                <div className="seg-tabs feed-filter-tabs">
                  <div className={`seg-tab ${newRouteVisibility === 'public' ? 'active' : ''}`} onClick={() => setNewRouteVisibility('public')}>🌍 Tutti</div>
                  <div className={`seg-tab ${newRouteVisibility === 'friends' ? 'active' : ''}`} onClick={() => setNewRouteVisibility('friends')}>👥 Amici</div>
                  <div className={`seg-tab ${newRouteVisibility === 'private' ? 'active' : ''}`} onClick={() => setNewRouteVisibility('private')}>🔒 Solo io</div>
                </div>
              </div>
            </div>
          )}

          {/* Ricerca locale → aggiunta tappa (sempre visibile in creazione) */}
          {isCreating && currentUser?.is_premium && (
            <div className="card" style={{ border: '1px solid var(--primary)', padding: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Search size={16} /> 2. Cerca un locale
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '12px' }}>
                Cerca un bar/pub/osteria <em>oppure</em> una via, una piazza o un indirizzo (es. &quot;Strada Nuova Venezia&quot;) e aggiungilo come tappa. Se non trovi nulla, usa &quot;tappa manuale&quot; qui sotto.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Nome locale + città..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleVenueSearch(); }}
                    style={{ height: '40px', fontSize: '13px', paddingLeft: '36px' }}
                  />
                </div>
                <button
                  onClick={handleVenueSearch}
                  className="btn btn-primary"
                  disabled={isSearching}
                  style={{ borderRadius: '10px', padding: '8px 14px', minWidth: '40px' }}
                >
                  {isSearching ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
                </button>
              </div>

              {justAdded && (
                <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid var(--success)', color: 'var(--success)', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={13} /> Tappa aggiunta: {justAdded}
                </div>
              )}

              {/* Risultati ricerca locale */}
              {searchResults.length > 0 && (
                <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                  {searchResults.map((result, idx) => {
                    const venueName = result.namedetails?.name || result.display_name.split(',')[0];
                    const venueAddr = result.display_name.split(',').slice(1, 3).join(',').trim();
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
                          borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border-dark)' : 'none',
                        }}
                      >
                        <button
                          onClick={() => handleCenterOnResult(result)}
                          title="Mostra sulla mappa"
                          style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 0 }}
                        >
                          <strong style={{ fontSize: '12px', color: '#FFF', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <MapPin size={11} style={{ marginRight: '4px', color: 'var(--primary)' }} />{venueName}
                          </strong>
                          <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {venueAddr}
                          </span>
                        </button>
                        <button
                          onClick={() => handleAddVenue(result)}
                          className="btn btn-primary"
                          style={{ borderRadius: '8px', padding: '6px 10px', fontSize: '11px', flexShrink: 0 }}
                        >
                          <Plus size={13} /> Tappa
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tappa manuale: posizione = centro mappa, nome a scelta */}
              <button
                onClick={handleAddManualStop}
                className="btn btn-secondary"
                style={{ width: '100%', borderRadius: '10px', fontSize: '12px', height: '36px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Plus size={13} /> Non lo trovi? Aggiungilo per indirizzo
              </button>

              {/* Opzione secondaria: esplora bar sulla mappa */}
              <details style={{ marginTop: '4px' }}>
                <summary style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}>
                  …oppure esplora i bar nella zona visibile sulla mappa
                </summary>
                <button
                  onClick={handleLoadBars}
                  className="btn btn-secondary"
                  disabled={isLoadingBars}
                  style={{ width: '100%', borderRadius: '10px', fontSize: '13px', height: '38px', marginTop: '8px' }}
                >
                  {isLoadingBars ? (
                    <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Ricerca bar reali...</>
                  ) : (
                    <><Beer size={14} /> Carica Bar in Questa Zona</>
                  )}
                </button>
                {discoveredBars.length > 0 && (
                  <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '6px', textAlign: 'center' }}>
                    Trovati <strong style={{ color: '#F59E0B' }}>{discoveredBars.length}</strong> bar/pub — clicca sui marker arancioni per aggiungerli
                  </p>
                )}
              </details>
            </div>
          )}

          {/* Tour Stops List (during creation) */}
          {isCreating && currentUser?.is_premium && (
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={16} color="var(--primary)" /> 3. Tappe del Tour
                </span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-dark-secondary)' }}>
                  {newRouteWaypoints.length} {newRouteWaypoints.length === 1 ? 'tappa' : 'tappe'}
                </span>
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '12px' }}>
                Imposta per ogni tappa il fabbisogno alcolico previsto (U.A.).
              </p>

              {newRouteWaypoints.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '20px 0' }}>
                  Usa la ricerca qui sopra per trovare un locale e premi <strong style={{ color: 'var(--primary)' }}>+ Tappa</strong> per aggiungerlo all&apos;itinerario.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {newRouteWaypoints.map((wp, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--bg-input-dark)',
                        border: '1px solid var(--border-dark)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{
                        background: '#EF4444',
                        color: 'white',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '800',
                        fontSize: '11px',
                        flexShrink: 0,
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {wp.name}
                        </strong>
                        {/* Fabbisogno alcolico per tappa */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px' }}>
                          <Beer size={12} color="var(--secondary)" />
                          <button type="button" onClick={() => handleUpdateWaypointUnits(idx, -0.5)}
                            style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', fontSize: 13, lineHeight: 1, color: '#FFF' }}>−</button>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--secondary)', minWidth: 54, textAlign: 'center' }}>
                            {(wp.units ?? 0).toFixed(1)} U.A.
                          </span>
                          <button type="button" onClick={() => handleUpdateWaypointUnits(idx, 0.5)}
                            style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', fontSize: 13, lineHeight: 1, color: '#FFF' }}>+</button>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveWaypoint(idx)}
                        style={{
                          background: 'rgba(239,68,68,0.15)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px',
                          cursor: 'pointer',
                          color: '#EF4444',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Saved Routes List (vista LISTA: solo elenco a piena larghezza) */}
          {listMode && (
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
                Itinerari Disponibili 🍺
              </h3>

              {/* Ricerca per TITOLO */}
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Cerca per titolo..."
                  value={routeSearchQuery}
                  onChange={(e) => setRouteSearchQuery(e.target.value)}
                  style={{
                    paddingLeft: '32px',
                    height: '34px',
                    fontSize: '12px',
                    background: 'var(--bg-input-dark)',
                    border: '1px solid var(--border-dark)',
                    borderRadius: '8px'
                  }}
                />
                {routeSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setRouteSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dark-secondary)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: 0
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Ricerca per LUOGO + raggio */}
              <div style={{ position: 'relative', marginBottom: '15px' }}>
                {placeFilter ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,32,0,0.08)', border: '1px solid var(--primary)', borderRadius: '8px', padding: '7px 10px' }}>
                    <MapPin size={14} color="var(--primary)" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: '12px', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {placeFilter.name}
                    </span>
                    <select
                      value={radiusKm}
                      onChange={(e) => setRadiusKm(Number(e.target.value))}
                      style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '6px', color: '#FFF', fontSize: '11px', padding: '2px 4px', flexShrink: 0 }}
                    >
                      {[1, 2, 5, 10, 25, 50].map((r) => <option key={r} value={r}>{r} km</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setPlaceFilter(null); setPlaceQuery(''); setPlaceResults([]); }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                      title="Rimuovi filtro luogo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <MapPin size={14} style={{ position: 'absolute', left: '10px', top: '17px', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Cerca per luogo (città, via, locale)..."
                      value={placeQuery}
                      onChange={(e) => setPlaceQuery(e.target.value)}
                      style={{
                        paddingLeft: '32px',
                        height: '34px',
                        fontSize: '12px',
                        background: 'var(--bg-input-dark)',
                        border: '1px solid var(--border-dark)',
                        borderRadius: '8px'
                      }}
                    />
                    {(placeSearching || placeResults.length > 0) && (
                      <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: '4px', background: 'var(--bg-card-dark, #1a1d2e)', border: '1px solid var(--border-dark)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                        {placeSearching && (
                          <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Cerco luoghi…
                          </div>
                        )}
                        {placeResults.map((v, i) => (
                          <button key={i} type="button"
                            onClick={() => { setPlaceFilter({ name: v.name, lat: v.lat, lng: v.lng }); setPlaceQuery(v.name); setPlaceResults([]); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-dark)', cursor: 'pointer' }}>
                            <span style={{ display: 'block', fontSize: '12px', color: '#FFF', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <MapPin size={11} style={{ marginRight: '4px', color: 'var(--primary)' }} />{v.name}
                            </span>
                            {v.address && <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dark-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.address}</span>}
                          </button>
                        ))}
                        {!placeSearching && placeResults.length === 0 && placeQuery.trim().length >= 2 && (
                          <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Nessun luogo trovato.</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '2px' }}>
                {filteredRoutes.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '20px 0' }}>
                    {routes.length === 0 ? 'Nessun tour salvato al momento. Crea il tuo primo itinerario!' : 'Nessun itinerario corrisponde alla ricerca.'}
                  </p>
                ) : (
                  filteredRoutes.map((route) => {
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
                          padding: '12px 14px',
                          background: isSelected ? 'rgba(255, 32, 0, 0.08)' : 'var(--bg-input-dark)',
                          borderColor: isSelected ? 'var(--primary)' : 'var(--border-dark)',
                          borderRadius: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '4px', gap: '6px' }}>
                          <strong style={{ fontSize: '13px', color: '#FFF', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{route.name}</span>
                            {route.user_id === currentUser?.id && (
                              <span style={{ fontSize: '8px', fontWeight: 800, color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '6px', padding: '1px 4px', flexShrink: 0 }}>I MIEI</span>
                            )}
                          </strong>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            {route.user_id === currentUser?.id && (
                              <span title={`Visibilità: ${route.visibility || 'public'}`} style={{ fontSize: '11px' }}>
                                {route.visibility === 'private' ? '🔒' : route.visibility === 'friends' ? '👥' : '🌍'}
                              </span>
                            )}
                            {route.is_premium && (
                              <span className="badge-premium" style={{ fontSize: '8px' }}>PRO</span>
                            )}
                          </span>
                        </div>
                        <p style={{
                          fontSize: '11px',
                          color: 'var(--text-dark-secondary)',
                          display: '-webkit-box',
                          WebkitLineClamp: '2',
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          margin: 0,
                        }}>
                          {route.description}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px', marginTop: '4px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>
                            {route.waypoints?.length || 0} tappe
                          </span>
                          {route.user_id !== currentUser?.id && (route.creator?.display_name || route.creator?.username) && (
                            <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                              <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: '8px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {(route.creator.display_name || route.creator.username).charAt(0).toUpperCase()}
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {route.creator.display_name || `@${route.creator.username}`}
                              </span>
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Route Statistics (solo in dettaglio/creazione, non nella lista) */}
          <div className="card" style={{ padding: '16px', display: listMode ? 'none' : undefined }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📊 Dati del Percorso
            </h3>
            
            {/* Selettore modalità di viaggio */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => setTravelMode('foot')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: travelMode === 'foot' ? 'rgba(255, 32, 0, 0.15)' : 'var(--bg-input-dark)',
                  border: travelMode === 'foot' ? '1px solid var(--primary)' : '1px solid var(--border-dark)',
                  color: travelMode === 'foot' ? '#FFF' : 'var(--text-dark-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                🚶‍♂️ A piedi
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('driving')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: travelMode === 'driving' ? 'rgba(255, 32, 0, 0.15)' : 'var(--bg-input-dark)',
                  border: travelMode === 'driving' ? '1px solid var(--primary)' : '1px solid var(--border-dark)',
                  color: travelMode === 'driving' ? '#FFF' : 'var(--text-dark-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                🚗 In auto
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
                <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="var(--primary)" /> Tappe Totali
                </span>
                <strong className="stat-value" style={{ fontSize: '15px' }}>{currentActiveWaypoints.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
                <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="var(--primary)" /> Distanza <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>(linea d&apos;aria)</span>
                </span>
                <strong className="stat-value" style={{ fontSize: '15px' }}>{routeDistance} km</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
                <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {travelMode === 'foot' ? <Footprints size={14} color="var(--primary)" /> : <MapPin size={14} color="var(--primary)" />} Tempo Stimato
                </span>
                <strong className="stat-value" style={{ fontSize: '15px' }}>~ {travelTime} min {travelMode === 'foot' ? 'a piedi' : 'in auto'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Beer size={14} color="var(--secondary)" /> Fabbisogno Alcolico
                </span>
                <strong className="stat-value" style={{ fontSize: '15px', color: 'var(--secondary)' }}>{routeTotalUnits.toFixed(1)} U.A.</strong>
              </div>
            </div>

            {/* Navigazione reale: deleghiamo a Google Maps (indicazioni vere a piedi/auto) */}
            {currentActiveWaypoints.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  const pts = currentActiveWaypoints.filter((w) => w.lat != null && (w.lng ?? w.lon) != null);
                  if (pts.length < 2) return;
                  const fmt = (w) => `${w.lat},${w.lng ?? w.lon}`;
                  const origin = fmt(pts[0]);
                  const destination = fmt(pts[pts.length - 1]);
                  const mid = pts.slice(1, -1).map(fmt).join('|');
                  const mode = travelMode === 'foot' ? 'walking' : 'driving';
                  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${mid ? `&waypoints=${encodeURIComponent(mid)}` : ''}&travelmode=${mode}`;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="btn btn-secondary"
                style={{ width: '100%', borderRadius: '20px', padding: '10px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '14px' }}
              >
                🧭 Apri in Google Maps
              </button>
            )}

            {/* Azioni sul percorso selezionato */}
            {!isCreating && selectedRoute && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px', borderTop: '1px solid var(--border-dark)', paddingTop: '16px' }}>
                {/* Impostazioni Tour: target drink/tappa + privacy */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>🎯 Target drink/tappa:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button type="button" onClick={() => setTourTarget((t) => Math.max(1, t - 1))} className="btn btn-secondary" style={{ width: 28, height: 28, borderRadius: '50%', padding: 0 }}>−</button>
                    <strong style={{ minWidth: 16, textAlign: 'center' }}>{tourTarget}</strong>
                    <button type="button" onClick={() => setTourTarget((t) => Math.min(10, t + 1))} className="btn btn-secondary" style={{ width: 28, height: 28, borderRadius: '50%', padding: 0 }}>+</button>
                  </div>
                </div>
                <div className="seg-tabs feed-filter-tabs">
                  <div className={`seg-tab ${tourVisibility === 'public' ? 'active' : ''}`} onClick={() => setTourVisibility('public')}>🌍 Tutti</div>
                  <div className={`seg-tab ${tourVisibility === 'friends' ? 'active' : ''}`} onClick={() => setTourVisibility('friends')}>👥 Amici</div>
                  <div className={`seg-tab ${tourVisibility === 'private' ? 'active' : ''}`} onClick={() => setTourVisibility('private')}>🔒 Privata</div>
                </div>
                <button
                  type="button"
                  onClick={handleStartTour}
                  disabled={startingTour}
                  className="btn btn-primary"
                  style={{ width: '100%', borderRadius: '20px', padding: '12px 14px', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: '700' }}
                >
                  {startingTour ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <>🗺️ Avvia Tour Guidato</>}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const shareUrl = siteUrl(`/routes?routeId=${selectedRoute.id}`);
                    navigator.clipboard.writeText(shareUrl);
                    alert("Link del percorso copiato negli appunti! Ora puoi condividerlo.");
                  }}
                  className="btn btn-secondary"
                  style={{ width: '100%', borderRadius: '20px', padding: '10px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  🔗 Condividi Percorso
                </button>

                {/* Gestione percorso: solo il proprietario può modificarlo/eliminarlo */}
                {selectedRoute.user_id === currentUser?.id && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleEditRoute(selectedRoute)}
                      className="btn btn-secondary"
                      style={{ flex: 1, borderRadius: '20px', padding: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Edit3 size={14} /> Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRoute(selectedRoute)}
                      disabled={deletingRoute}
                      className="btn btn-secondary"
                      style={{ flex: 1, borderRadius: '20px', padding: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--error)', borderColor: 'var(--error)' }}
                    >
                      {deletingRoute ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />} Elimina
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE: MAP */}
        <div className="routes-map-wrap" style={{ position: 'relative', display: listMode ? 'none' : undefined }}>
          <div
            id="map-container"
            className="map-container routes-map"
            style={{ borderRadius: 'var(--radius)' }}
          />

          {/* Paywall Overlay for non-premium users */}
          {isCreating && (!currentUser || !currentUser.is_premium) && (
            <div className="paywall-overlay">
              <span className="paywall-badge">Strabar Summit 🏔️</span>
              <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#FFF', marginBottom: '12px' }}>
                Pianifica i tuoi Pub Crawl
              </h2>
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', maxWidth: '420px', marginBottom: '25px', lineHeight: '1.5' }}>
                Il pianificatore avanzato di itinerari con mappatura automatica dei bar reali è una funzionalità Premium. Cerca bar in tutto il mondo, crea percorsi personalizzati e salvali.
              </p>
              <div style={{ display: 'flex', gap: '15px' }}>
                <button onClick={handleCancelCreation} className="btn btn-secondary">
                  Guarda Tour Pubblici
                </button>
                <Link href="/premium" className="btn btn-premium">
                  Sblocca con Premium
                </Link>
              </div>
            </div>
          )}

          {/* Selected Route Waypoints (when not creating) */}
          {!isCreating && currentActiveWaypoints.length > 0 && (
            <div className="card" style={{ marginTop: '16px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700' }}>
                  {selectedRoute?.name || 'Tour'} — Tappe ({currentActiveWaypoints.length})
                </h3>
                {/* Step-through prev/next */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => setActiveWaypointIndex((i) => Math.max(0, (i == null ? 0 : i - 1)))}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '14px' }}
                    title="Tappa precedente"
                  >‹</button>
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', minWidth: '54px', textAlign: 'center' }}>
                    {activeWaypointIndex == null ? '—' : `${activeWaypointIndex + 1} / ${currentActiveWaypoints.length}`}
                  </span>
                  <button
                    onClick={() => setActiveWaypointIndex((i) => Math.min(currentActiveWaypoints.length - 1, (i == null ? 0 : i + 1)))}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '14px' }}
                    title="Tappa successiva"
                  >›</button>
                </div>
              </div>

              {/* Naviga l'intero itinerario con Google Maps (indicazioni tra tutte le tappe) */}
              {currentActiveWaypoints.length >= 2 && (
                <a
                  href={`https://www.google.com/maps/dir/${currentActiveWaypoints.map((w) => `${w.lat},${w.lng}`).join('/')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ width: '100%', borderRadius: '20px', padding: '10px', fontSize: '13px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <MapPin size={15} /> Naviga l&apos;itinerario (Google Maps)
                </a>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {currentActiveWaypoints.map((wp, idx) => {
                  const active = idx === activeWaypointIndex;
                  return (
                    <div
                      key={idx}
                      onClick={() => setActiveWaypointIndex(idx)}
                      style={{
                        background: active ? 'rgba(223, 255, 0,0.1)' : 'var(--bg-input-dark)',
                        border: active ? '1px solid var(--secondary)' : '1px solid var(--border-dark)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0, flex: 1 }}>
                        <div style={{
                          background: active ? '#DFFF00' : '#EF4444',
                          color: 'white',
                          width: active ? '26px' : '22px',
                          height: active ? '26px' : '22px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '800',
                          fontSize: '11px',
                          flexShrink: 0,
                          transition: 'var(--transition)',
                        }}>
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ display: 'block', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {wp.name}
                          </strong>
                          <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {wp.note}
                          </span>
                          {wp.units != null && (
                            <span style={{ fontSize: '10px', color: 'var(--secondary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                              <Beer size={10} /> {parseFloat(wp.units).toFixed(1)} U.A.
                            </span>
                          )}
                        </div>
                      </div>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${wp.lat},${wp.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Naviga a questa tappa"
                        style={{ fontSize: '16px', flexShrink: 0, textDecoration: 'none' }}
                      >
                        🧭
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .leaflet-popup-content-wrapper {
          background: #1a1d2e !important;
          color: #f3f4f6 !important;
          border-radius: 10px !important;
          border: 1px solid #2a2f42 !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
        }
        .leaflet-popup-tip {
          background: #1a1d2e !important;
          border: 1px solid #2a2f42 !important;
        }
        .leaflet-popup-close-button {
          color: #9ca3af !important;
        }
        .leaflet-popup-close-button:hover {
          color: #ff2000 !important;
        }
      `}</style>
    </div>
  );
}
