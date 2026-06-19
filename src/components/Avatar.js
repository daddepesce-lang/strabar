'use client';

import { useState } from 'react';

// Tondino avatar riutilizzabile.
// - mostra la foto se c'è un URL valido (NO base64);
// - fallback automatico alle iniziali se manca la foto o se l'immagine non carica (onError).
export default function Avatar({ src, name, size = 44, fontSize, style = {}, className = 'activity-avatar' }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || 'U').charAt(0).toUpperCase();
  const isUsable = src && !failed && !String(src).startsWith('data:'); // niente base64
  return (
    <div
      className={className}
      style={{ width: size, height: size, fontSize: fontSize || Math.round(size * 0.42), overflow: 'hidden', flexShrink: 0, ...style }}
    >
      {isUsable ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || 'avatar'}
          width={size}
          height={size}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setFailed(true)}
        />
      ) : (
        initial
      )}
    </div>
  );
}
