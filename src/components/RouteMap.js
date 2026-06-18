'use client';

import { useEffect, useRef } from 'react';

/**
 * Mappa Leaflet reale e interattiva (non disegnata).
 * Mostra una lista di tappe numerate collegate da un percorso.
 *
 * props:
 *  - waypoints: [{ name, lat, lng, note, label? }]
 *  - height: altezza CSS (default 420px)
 *  - interactive: se false disabilita scroll/drag (default true)
 *  - connectLine: se false mostra solo i marker senza la polilinea (default true)
 *  - markerColor: colore dei marker (default arancione primary)
 */
export default function RouteMap({ waypoints = [], height = '420px', interactive = true, connectLine = true, markerColor = '#FF2000', activeIndex = null, onSelect = null, center = null, radiusMeters = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const layersRef = useRef([]);
  const markersRef = useRef([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Inizializza la mappa una sola volta
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import('leaflet');
      if (cancelled) return;
      leafletRef.current = L;

      // Fix icone di default in Next.js
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (mapRef.current) return;

      const map = L.map(containerRef.current, {
        scrollWheelZoom: interactive,
        dragging: interactive,
        zoomControl: interactive,
        attributionControl: true,
      }).setView([45.4382, 12.3353], 15);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map);

      mapRef.current = map;
      drawWaypoints();
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ridisegna le tappe quando cambiano (o quando cambia centro/raggio del radar)
  useEffect(() => {
    drawWaypoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(waypoints), center?.lat, center?.lng, radiusMeters]);

  // Quando cambia la tappa attiva: evidenzia, centra e apri il popup (senza rifare il fit)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeIndex == null) return;
    const marker = markersRef.current[activeIndex];
    if (!marker) return;
    updateMarkerIcons();
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.6 });
    marker.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const makeIcon = (label, active) => {
    const L = leafletRef.current;
    const size = active ? 38 : 28;
    const bg = active ? '#DFFF00' : markerColor;
    const ring = active ? '3px solid #fff' : '2px solid #fff';
    const glow = active ? '0 0 0 4px rgba(223, 255, 0,0.35), 0 2px 10px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.5)';
    return L.divIcon({
      className: 'custom-numbered-marker',
      html: `<div style="background:${bg};color:#fff;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${active ? 15 : 12}px;border:${ring};box-shadow:${glow};transition:all .2s;">${label}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  };

  const updateMarkerIcons = () => {
    markersRef.current.forEach((marker, idx) => {
      if (!marker) return;
      const wp = waypoints[idx];
      const label = wp && wp.label != null ? wp.label : idx + 1;
      marker.setIcon(makeIcon(label, idx === activeIndex));
      if (idx === activeIndex) marker.setZIndexOffset(1000);
      else marker.setZIndexOffset(0);
    });
  };

  const drawWaypoints = () => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    // Pulisci layer precedenti
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];
    markersRef.current = [];

    // Centro "tu sei qui" + cerchio del raggio (radar)
    let circle = null;
    if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
      const youIcon = L.divIcon({
        className: 'you-are-here-marker',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(59,130,246,0.25),0 2px 6px rgba(0,0,0,0.5);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const you = L.marker([center.lat, center.lng], { icon: youIcon, interactive: false }).addTo(map).bindPopup('<strong>Sei qui</strong>');
      layersRef.current.push(you);

      if (radiusMeters) {
        circle = L.circle([center.lat, center.lng], {
          radius: radiusMeters,
          color: markerColor,
          weight: 1.5,
          fillColor: markerColor,
          fillOpacity: 0.07,
        }).addTo(map);
        layersRef.current.push(circle);
      }
    }

    if ((!waypoints || waypoints.length === 0)) {
      // Anche senza tappe, inquadra il cerchio/centro se presenti
      if (circle) map.fitBounds(circle.getBounds(), { padding: [30, 30] });
      else if (center) map.setView([center.lat, center.lng], 14);
      return;
    }

    const coords = [];
    waypoints.forEach((wp, idx) => {
      const lat = wp.lat;
      const lng = wp.lng ?? wp.lon;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      const label = wp.label != null ? wp.label : idx + 1;
      const marker = L.marker([lat, lng], { icon: makeIcon(label, idx === activeIndex) })
        .addTo(map)
        .bindPopup(`<strong>${wp.name || 'Tappa'}</strong>${wp.note ? `<br/>${wp.note}` : ''}`);
      marker.on('click', () => { if (onSelectRef.current) onSelectRef.current(idx); });
      layersRef.current.push(marker);
      markersRef.current[idx] = marker;
      coords.push([lat, lng]);
    });

    if (connectLine && coords.length > 1) {
      const line = L.polyline(coords, { color: markerColor, weight: 3, dashArray: '8, 12', opacity: 0.85 }).addTo(map);
      layersRef.current.push(line);
    }

    // Inquadratura: se c'è il cerchio del radar, mostra tutto il raggio; altrimenti le tappe
    if (circle) {
      map.fitBounds(circle.getBounds(), { padding: [30, 30] });
    } else if (coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
    } else if (coords.length === 1) {
      map.setView(coords[0], 16);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%', borderRadius: '16px', border: '1px solid var(--border-dark)', overflow: 'hidden', zIndex: 1 }}
    />
  );
}
