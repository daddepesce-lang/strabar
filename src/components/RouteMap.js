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
export default function RouteMap({ waypoints = [], height = '420px', interactive = true, connectLine = true, markerColor = '#FF5E00' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const layersRef = useRef([]);

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

  // Ridisegna le tappe quando cambiano
  useEffect(() => {
    drawWaypoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(waypoints)]);

  const drawWaypoints = () => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    // Pulisci layer precedenti
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];

    if (!waypoints || waypoints.length === 0) return;

    const coords = [];
    waypoints.forEach((wp, idx) => {
      const lat = wp.lat;
      const lng = wp.lng ?? wp.lon;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      const label = wp.label != null ? wp.label : idx + 1;
      const icon = L.divIcon({
        className: 'custom-numbered-marker',
        html: `<div style="background:${markerColor};color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);">${label}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`<strong>${wp.name || 'Tappa'}</strong>${wp.note ? `<br/>${wp.note}` : ''}`);
      layersRef.current.push(marker);
      coords.push([lat, lng]);
    });

    if (coords.length > 1) {
      if (connectLine) {
        const line = L.polyline(coords, { color: markerColor, weight: 3, dashArray: '8, 12', opacity: 0.85 }).addTo(map);
        layersRef.current.push(line);
      }
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
