'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Beer, Camera, Heart, MapPin, MessageCircle } from 'lucide-react';
import Avatar from '@/components/Avatar';

export default function ProfilePosts({ activities = [], name, avatarUrl, t, locale = 'it', owner = false }) {
  const [showAll, setShowAll] = useState(false);
  const posts = [...activities].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const visible = showAll ? posts : posts.slice(0, 5);
  const dateLocale = { it: 'it-IT', en: 'en-GB', fr: 'fr-FR', es: 'es-ES' }[locale] || 'it-IT';

  return (
    <section className="profile-posts" aria-label={t('profile.postsTitle')}>
      <div className="profile-posts-header">
        <div><span className="social-eyebrow">{t('profile.momentsEyebrow')}</span><h2>{t('profile.postsTitle')}</h2></div>
        <span className="social-count">{posts.length}</span>
      </div>
      {!posts.length ? (
        <div className="social-empty profile-posts-empty">
          <Beer size={28} />
          <p>{owner ? t('profile.postsEmptyOwn') : t('profile.postsEmptyOther')}</p>
          {owner && <Link href="/log" className="btn btn-primary">{t('profile.photosAdd')}</Link>}
        </div>
      ) : (
        <>
          <div className="profile-post-list">
            {visible.map((act) => (
              <Link href={`/?activity=${act.id}`} className="profile-post" key={act.id}>
                <div className="profile-post-author">
                  <Avatar src={avatarUrl} name={name} size={38} />
                  <div><strong>{name}</strong><span>{new Date(act.created_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })}{act.location?.name ? ` · ${act.location.name}` : ''}</span></div>
                </div>
                {act.cover_url && /^https?:\/\//.test(act.cover_url) && (
                  <div className="profile-post-cover">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={act.cover_url} alt={act.title || t('profile.photosTitle')} loading="lazy" decoding="async" />
                    <span><Camera size={14} /> {t('profile.photosTitle')}</span>
                  </div>
                )}
                <div className="profile-post-content">
                  <h3>{act.title || t('profile.postsTitle')}</h3>
                  {act.description && <p>{act.description}</p>}
                  {act.location?.name && <span className="profile-post-location"><MapPin size={14} /> {act.location.name}</span>}
                  <div className="profile-post-footer">
                    <span><Beer size={16} /> {(act.drinks || []).reduce((n, d) => n + (Number(d.qty) || 0), 0)} {t('profile.sDrink')}</span>
                    <span><Heart size={16} /> {act.cheers?.length || 0}</span>
                    <span><MessageCircle size={16} /> {act.comments?.length || 0}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {posts.length > 5 && <button type="button" className="btn btn-secondary profile-posts-more" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>{showAll ? t('places.showLess') : t('profile.postsMore', { n: posts.length - 5 })}</button>}
        </>
      )}
    </section>
  );
}
