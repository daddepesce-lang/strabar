'use client';

import { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import { siteUrl } from '@/lib/site';
import { useT } from '@/lib/i18n';

// Pulsante riutilizzabile per invitare amici su Strabar.
// Usa il foglio di condivisione nativo del telefono (WhatsApp, Instagram, SMS…)
// e ricade su "copia link" sul desktop. Il link punta a /install.
export default function ShareAppButton({ style, className, label, compact = false }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const buttonLabel = label ?? t('shareapp.inviteFriends');

  // Link canonico: punta sempre a strabar.app/install, indipendentemente dal dominio aperto.
  const getUrl = () => siteUrl('/install');
  const text = t('shareapp.shareText');

  const handleShare = async () => {
    const url = getUrl();
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: t('shareapp.shareTitle'), text, url });
        return;
      }
    } catch {
      // condivisione annullata: non fare nulla
      return;
    }
    // Fallback desktop: copia negli appunti
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(t('shareapp.shareLink', { url }));
    }
  };

  return (
    <button
      onClick={handleShare}
      className={className || 'btn btn-primary'}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 700, ...style }}
    >
      {copied ? <Check size={compact ? 15 : 18} /> : navigatorHasShare() ? <Share2 size={compact ? 15 : 18} /> : <Copy size={compact ? 15 : 18} />}
      {copied ? t('shareapp.linkCopied') : buttonLabel}
    </button>
  );
}

function navigatorHasShare() {
  return typeof navigator !== 'undefined' && !!navigator.share;
}
