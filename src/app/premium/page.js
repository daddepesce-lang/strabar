'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { Award, Check, ShieldCheck, Map, BarChart3, Flame, Smile, AlertCircle } from 'lucide-react';

export default function PremiumPage() {
  const t = useT();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await db.getCurrentUser();
      setUser(currentUser);
    };
    checkUser();
  }, []);

  const handleUpgrade = async () => {
    if (!user) {
      router.push('/auth');
      return;
    }

    setLoading(true);
    try {
      // Simula una chiamata di rete
      await new Promise(resolve => setTimeout(resolve, 2000));
      await db.upgradeToPremium();
      setSuccess(true);
      
      // Notifica navbar del cambiamento
      window.dispatchEvent(new Event('auth-change'));
      
      // Aggiorna stato locale
      const updatedUser = await db.getCurrentUser();
      setUser(updatedUser);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '50px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <span className="badge-premium" style={{ fontSize: '14px', padding: '6px 14px', marginBottom: '15px' }}>
          Strabar Summit 🏔️
        </span>
        <h1 style={{ fontSize: '42px', fontWeight: '800', marginBottom: '15px', background: 'var(--premium-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {t('premiumpage.heroTitle')}
        </h1>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '18px', maxWidth: '600px', margin: '0 auto' }}>
          {t('premiumpage.subtitlePre')} <strong style={{ color: 'var(--secondary)' }}>{t('premiumpage.subtitleStrong')}</strong>{t('premiumpage.subtitlePost')}
        </p>
      </div>

      {success && (
        <div className="card" style={{ border: '2px solid var(--success)', background: 'rgba(16, 185, 129, 0.05)', textAlign: 'center', padding: '30px', marginBottom: '30px' }}>
          <ShieldCheck size={50} color="var(--success)" style={{ margin: '0 auto 15px auto' }} />
          <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#FFF', marginBottom: '10px' }}>{t('premiumpage.successTitle')}</h2>
          <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
            {t('premiumpage.successText')}
          </p>
          <button onClick={() => router.push('/routes')} className="btn btn-primary">
            {t('premiumpage.successCta')}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', alignItems: 'stretch' }}>
        {/* Colonna Sinistra: Benefici */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ display: 'flex', gap: '15px', padding: '20px' }}>
            <div style={{ background: 'rgba(255, 59, 47, 0.1)', padding: '12px', borderRadius: '12px', height: 'fit-content', color: 'var(--primary)' }}>
              <Map size={24} />
            </div>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>{t('premiumpage.feature1Title')}</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: '1.4' }}>
                {t('premiumpage.feature1Desc')}
              </p>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', gap: '15px', padding: '20px' }}>
            <div style={{ background: 'rgba(223, 255, 0, 0.1)', padding: '12px', borderRadius: '12px', height: 'fit-content', color: 'var(--secondary)' }}>
              <BarChart3 size={24} />
            </div>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>{t('premiumpage.feature2Title')}</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: '1.4' }}>
                {t('premiumpage.feature2Desc')}
              </p>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', gap: '15px', padding: '20px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '12px', height: 'fit-content', color: 'var(--success)' }}>
              <Flame size={24} />
            </div>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>{t('premiumpage.feature3Title')}</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: '1.4' }}>
                {t('premiumpage.feature3Desc')}
              </p>
            </div>
          </div>
        </div>

        {/* Colonna Destra: Cassa / Pricing */}
        <div className="card" style={{ border: '2px solid var(--primary)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '35px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '22px', fontWeight: '800' }}>Strabar Summit</h3>
              <span style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', fontWeight: '700', fontSize: '12px', padding: '4px 10px', borderRadius: '12px' }}>
                {t('premiumpage.betaBadge')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginBottom: '30px' }}>
              <span style={{ fontSize: '46px', fontWeight: '900' }}>{t('premiumpage.priceFree')}</span>
              <span style={{ color: 'var(--text-dark-secondary)' }}>{t('premiumpage.priceSuffix')}</span>
            </div>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '30px' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                <Check size={16} color="var(--primary)" /> {t('premiumpage.planFeature1')}
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                <Check size={16} color="var(--primary)" /> {t('premiumpage.planFeature2')}
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                <Check size={16} color="var(--primary)" /> {t('premiumpage.planFeature3')}
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                <Check size={16} color="var(--primary)" /> {t('premiumpage.planFeature4')}
              </li>
            </ul>
          </div>

          <div>
            {user?.is_premium ? (
              <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(223, 255, 0, 0.1)', color: 'var(--secondary)', fontWeight: '700', borderRadius: '20px', border: '1px solid var(--secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span>{t('premiumpage.unlockedTitle')}</span>
                <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-dark-secondary)' }}>
                  {t('premiumpage.unlockedSubtitle')}
                </span>
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                className="btn btn-premium"
                style={{ width: '100%', padding: '16px', borderRadius: '30px', fontSize: '16px' }}
                disabled={loading || success}
              >
                {loading ? t('premiumpage.ctaLoading') : t('premiumpage.ctaUnlock')}
              </button>
            )}

            <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textAlign: 'center', marginTop: '12px', lineHeight: '1.4' }}>
              {t('premiumpage.disclaimer')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
