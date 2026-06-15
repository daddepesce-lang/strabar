'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Map, Plus, Save, MapPin, Footprints, Search, X, Loader, Beer, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function RoutesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteDesc, setNewRouteDesc] = useState('');
  const [newRouteWaypoints, setNewRouteWaypoints] = useState([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [routeSearchQuery, setRouteSearchQuery] = useState(''); // Filtro lista itinerari
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

        if (data.length > 0) {
          setSelectedRoute(data[0]);
        }
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

  // Recupera il percorso stradale reale (foot o driving) tramite OSRM API
  // Nota: Utilizziamo il profilo 'driving' di OSRM come base per le strade reali per evitare errori 404/400 (il server pubblico supporta principalmente driving)
  // e ricalcoliamo la durata a piedi sul lato client se travelMode è 'foot'.
  useEffect(() => {
    const activeWaypoints = isCreating ? newRouteWaypoints : (selectedRoute?.waypoints || []);
    if (activeWaypoints.length < 2) {
      setRouteCoordsState([]);
      setOsrmDistance(0);
      setOsrmDuration(0);
      return;
    }

    const fetchRoute = async () => {
      try {
        const coordString = activeWaypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`);
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
          setRouteCoordsState(coords);
          const distKm = parseFloat((route.distance / 1000).toFixed(2));
          setOsrmDistance(distKm);
          
          if (travelMode === 'foot') {
            // Calcolo tempo a piedi: ~4.5 km/h
            setOsrmDuration(Math.round((distKm / 4.5) * 60));
          } else {
            setOsrmDuration(Math.round(route.duration / 60));
          }
        } else {
          const straightCoords = activeWaypoints.map(wp => [wp.lat, wp.lng]);
          setRouteCoordsState(straightCoords);
        }
      } catch (err) {
        console.error("Errore nel calcolo del percorso stradale:", err);
        const straightCoords = activeWaypoints.map(wp => [wp.lat, wp.lng]);
        setRouteCoordsState(straightCoords);
      }
    };

    fetchRoute();
  }, [newRouteWaypoints, selectedRoute, isCreating, travelMode]);

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
      const numberedIcon = L.divIcon({
        className: 'custom-numbered-marker',
        html: `<div style="
          background: #EF4444;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 13px;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        ">${idx + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([wp.lat, wp.lng], { icon: numberedIcon })
        .addTo(mapInstance.current)
        .bindPopup(`<strong>Stop ${idx + 1}: ${wp.name}</strong><br/>${wp.note || ''}`);

      markersRef.current.push(marker);
      coords.push([wp.lat, wp.lng]);
    });

    // Draw dashed polyline connecting tour stops
    if (routeCoordsState && routeCoordsState.length > 1) {
      mapInstance.current.invalidateSize(); // Corregge dimensioni grigie di Leaflet in React
      polylineRef.current = L.polyline(routeCoordsState, {
        color: '#FF5E00',
        weight: 4,
        opacity: 0.85,
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
      addBtn.style.background = '#FF5E00';
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
    setDiscoveredBars([]);
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
    setSelectedRoute(null);
    setNewRouteWaypoints([]);
    setNewRouteName('');
    setNewRouteDesc('');
    setDiscoveredBars([]);
  };

  const handleCancelCreation = () => {
    setIsCreating(false);
    setNewRouteWaypoints([]);
    setNewRouteName('');
    setNewRouteDesc('');
    setDiscoveredBars([]);
    setSearchQuery('');
    setSearchResults([]);
    // Re-select first route if available
    if (routes.length > 0) {
      setSelectedRoute(routes[0]);
    }
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
      const saved = await db.saveRoute(newRouteName, newRouteDesc, newRouteWaypoints);
      setRoutes(prev => [saved, ...prev]);
      setSelectedRoute(saved);
      setIsCreating(false);
      alert('Itinerario salvato con successo!');
    } catch (err) {
      console.error(err);
      alert('Impossibile salvare l\'itinerario.');
    }
  };

  const handleRemoveWaypoint = (index) => {
    setNewRouteWaypoints((prev) => prev.filter((_, i) => i !== index));
  };

  // Computed values
  const currentActiveWaypoints = isCreating ? newRouteWaypoints : (selectedRoute?.waypoints || []);
  const routeDistance = osrmDistance > 0 ? osrmDistance : parseFloat(calculateTotalDistance(currentActiveWaypoints));
  const travelTime = osrmDuration > 0 ? osrmDuration : Math.round((routeDistance / 4.5) * 60);
  const routeTotalUnits = currentActiveWaypoints.reduce((s, wp) => s + (parseFloat(wp.units) || 0), 0);

  const filteredRoutes = routes.filter(route => {
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
                <Save size={16} /> Salva Tour
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

      {/* Main Grid: Sidebar + Map */}
      <div className="r-grid-sidebar">
        {/* LEFT SIDEBAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>

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
            </div>
          )}

          {/* Ricerca locale → aggiunta tappa (sempre visibile in creazione) */}
          {isCreating && currentUser?.is_premium && (
            <div className="card" style={{ border: '1px solid var(--primary)', padding: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Search size={16} /> 2. Cerca un locale
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '12px' }}>
                Scrivi il nome di un bar, pub o osteria (es. &quot;Cantina Do Mori Venezia&quot;) e aggiungilo come tappa.
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

          {/* Saved Routes List (when not creating) */}
          {!isCreating && (
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
                Itinerari Disponibili 🍺
              </h3>

              {/* Barra di ricerca per area/città/nome */}
              <div style={{ position: 'relative', marginBottom: '15px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Cerca per città, area o nome..."
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto', paddingRight: '2px' }}>
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
                          background: isSelected ? 'rgba(255, 94, 0, 0.08)' : 'var(--bg-input-dark)',
                          borderColor: isSelected ? 'var(--primary)' : 'var(--border-dark)',
                          borderRadius: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '13px', color: '#FFF' }}>{route.name}</strong>
                          {route.is_premium && (
                            <span className="badge-premium" style={{ fontSize: '8px' }}>PRO</span>
                          )}
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
                        <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', marginTop: '4px' }}>
                          {route.waypoints?.length || 0} tappe
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Route Statistics */}
          <div className="card" style={{ padding: '16px' }}>
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
                  background: travelMode === 'foot' ? 'rgba(255, 94, 0, 0.15)' : 'var(--bg-input-dark)',
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
                  background: travelMode === 'driving' ? 'rgba(255, 94, 0, 0.15)' : 'var(--bg-input-dark)',
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
                  <MapPin size={14} color="var(--primary)" /> Distanza Totale
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

            {/* Azioni sul percorso selezionato */}
            {!isCreating && selectedRoute && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px', borderTop: '1px solid var(--border-dark)', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/log?routeId=${selectedRoute.id}`);
                  }}
                  className="btn btn-primary"
                  style={{ width: '100%', borderRadius: '20px', padding: '10px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: '700' }}
                >
                  <Beer size={16} /> Avvia Sessione & Navigazione 🍻
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/routes?routeId=${selectedRoute.id}`;
                    navigator.clipboard.writeText(shareUrl);
                    alert("Link del percorso copiato negli appunti! Ora puoi condividerlo.");
                  }}
                  className="btn btn-secondary"
                  style={{ width: '100%', borderRadius: '20px', padding: '10px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  🔗 Condividi Percorso
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE: MAP */}
        <div style={{ position: 'relative' }}>
          <div
            id="map-container"
            className="map-container"
            style={{ height: '600px', borderRadius: 'var(--radius)' }}
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
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '10px' }}>
                {selectedRoute?.name || 'Tour'} — Elenco Tappe
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                {currentActiveWaypoints.map((wp, idx) => (
                  <div key={idx} style={{
                    background: 'var(--bg-input-dark)',
                    border: '1px solid var(--border-dark)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0, flex: 1 }}>
                      <div style={{
                        background: '#EF4444',
                        color: 'white',
                        width: '22px',
                        height: '22px',
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
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wp.name + ' ' + (selectedRoute?.name?.includes('Venezia') ? 'Venezia' : selectedRoute?.name?.includes('Roma') ? 'Roma' : selectedRoute?.name?.includes('Milano') ? 'Milano' : ''))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Cerca su Google Maps"
                      style={{ fontSize: '16px', flexShrink: 0, textDecoration: 'none' }}
                    >
                      🗺️
                    </a>
                  </div>
                ))}
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
          color: #ff5e00 !important;
        }
      `}</style>
    </div>
  );
}
