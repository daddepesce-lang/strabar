'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Award, Camera, ChevronDown, MapPin, Plus } from 'lucide-react';
import { badgeProgress, seasonalBadges } from '@/lib/badges';

export default function ProfileSocialShowcase({ activities = [], t, owner = false }) {
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const photos = activities.filter((a) => typeof a.cover_url === 'string' && /^https?:\/\//.test(a.cover_url));
  const badges = [
    ...badgeProgress(activities),
    ...seasonalBadges(activities, Date.now()),
  ].filter((b) => b.earned);
  const visiblePhotos = showAllPhotos ? photos : photos.slice(0, 6);
  const visibleBadges = showAllBadges ? badges : badges.slice(0, 5);

  return (
    <div className="social-showcase">
      <section className="social-showcase-card social-photos" aria-label={t('profile.photosTitle')}>
        <div className="social-showcase-heading">
          <div>
            <span className="social-eyebrow">{t('profile.momentsEyebrow')}</span>
            <h2><Camera size={19} /> {t('profile.photosTitle')}</h2>
          </div>
          <span className="social-count">{photos.length}</span>
        </div>
        {photos.length ? (
          <>
            <div className="social-photo-grid">
              {visiblePhotos.map((act) => (
                <Link key={act.id} href={`/?activity=${act.id}`} className="social-photo" aria-label={act.title || t('profile.photosTitle')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={act.cover_url} alt={act.title || t('profile.photosTitle')} loading="lazy" decoding="async" />
                  <span className="social-photo-caption">{act.location?.name ? <><MapPin size={12} /> {act.location.name}</> : act.title}</span>
                </Link>
              ))}
            </div>
            {photos.length > 6 && (
              <button type="button" className="social-show-more" onClick={() => setShowAllPhotos((v) => !v)} aria-expanded={showAllPhotos}>
                {showAllPhotos ? t('places.showLess') : t('profile.photosMore', { n: photos.length - 6 })} <ChevronDown size={15} className={showAllPhotos ? 'social-chevron-up' : ''} />
              </button>
            )}
          </>
        ) : (
          <div className="social-empty">
            <Camera size={27} />
            <p>{owner ? t('profile.photosEmptyOwn') : t('profile.photosEmptyOther')}</p>
            {owner && <Link href="/log" className="btn btn-secondary"><Plus size={15} /> {t('profile.photosAdd')}</Link>}
          </div>
        )}
      </section>

      <section className="social-showcase-card social-badges" aria-label={t('profile.badgesHeader')}>
        <div className="social-showcase-heading">
          <div>
            <span className="social-eyebrow">{t('profile.achievementsEyebrow')}</span>
            <h2><Award size={19} /> {t('profile.badgesHeader')}</h2>
          </div>
          <span className="social-count">{badges.length}</span>
        </div>
        {badges.length ? (
          <>
            <div className="social-badge-list">
              {visibleBadges.map((badge) => (
                <div className="social-badge" key={badge.id} title={t(`profile.bdg.${badge.id}.d`)}>
                  <span className="social-badge-icon" aria-hidden="true">{badge.icon}</span>
                  <span>{t(`profile.bdg.${badge.id}.t`)}</span>
                </div>
              ))}
            </div>
            {badges.length > 5 && (
              <button type="button" className="social-show-more" onClick={() => setShowAllBadges((v) => !v)} aria-expanded={showAllBadges}>
                {showAllBadges ? t('places.showLess') : t('profile.badgesMore', { n: badges.length - 5 })} <ChevronDown size={15} className={showAllBadges ? 'social-chevron-up' : ''} />
              </button>
            )}
          </>
        ) : (
          <div className="social-empty social-empty-badges">
            <Award size={27} />
            <p>{owner ? t('profile.badgesEmptyOwn') : t('profile.badgesEmptyOther')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
