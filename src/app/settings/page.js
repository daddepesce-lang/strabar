'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { User, AtSign, Camera, Lock, Loader, Check, Bell, Megaphone } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { ensureNotificationPermission } from '@/lib/notify';
import { useT } from '@/lib/i18n';

export default function SettingsPage() {
  const t = useT();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  // Notifiche push (per utente, per dispositivo)
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');

  const NOTIF_TYPES = [
    { key: 'cheers', label: t('settingspage.notifCheers') },
    { key: 'comment', label: t('settingspage.notifComment') },
    { key: 'follow', label: t('settingspage.notifFollow') },
    { key: 'events', label: t('settingspage.notifEvents') },
    { key: 'tagged', label: t('settingspage.notifTagged') },
    { key: 'inactivity', label: t('settingspage.notifInactivity') },
    { key: 'driving', label: t('settingspage.notifDriving') },
  ];
  const [notifPrefs, setNotifPrefs] = useState({ follow: true, cheers: true, comment: true, events: true, tagged: true, inactivity: true, driving: true });
  const [marketingConsent, setMarketingConsent] = useState(true);

  // Mostrare il proprio tasso alcolico attuale sul profilo pubblico (visibile agli altri)
  const [showBacPublic, setShowBacPublic] = useState(false);

  // Come compaio agli altri: 'name' (nome reale) | 'username' (@username) | 'alias' (nome di fantasia)
  const [nameMode, setNameMode] = useState('name');
  const [alias, setAlias] = useState('');
  const [aliasMsg, setAliasMsg] = useState('');
  const [aliasErr, setAliasErr] = useState(false);

  // Comparire col proprio nome nelle classifiche pubbliche (globale + evento). Default: sì.
  const [publicLeaderboard, setPublicLeaderboard] = useState(true);

  // GDPR: esportazione dati (portabilità) e cancellazione account (oblio)
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dataMsg, setDataMsg] = useState('');
  const [dataErr, setDataErr] = useState('');

  const [photoPromptOn, setPhotoPromptOn] = useState(true);

  useEffect(() => {
    if (typeof db.isPushSubscribed === 'function') db.isPushSubscribed().then(setPushOn);
    try { setPhotoPromptOn(localStorage.getItem('strabar_photo_prompt_off') !== '1'); } catch { /* noop */ }
  }, []);

  const togglePhotoPrompt = () => {
    const next = !photoPromptOn;
    setPhotoPromptOn(next);
    // ON = chiedi (nessun flag) · OFF = '1'. Solo locale: zero costi DB/egress.
    try { next ? localStorage.removeItem('strabar_photo_prompt_off') : localStorage.setItem('strabar_photo_prompt_off', '1'); } catch { /* noop */ }
  };

  const toggleNotifPref = async (key) => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    try { await db.updateProfile(currentUser.id, { notif_prefs: next }); } catch (err) { console.error(err); }
  };

  const toggleShowBacPublic = async () => {
    const next = !showBacPublic;
    setShowBacPublic(next);
    try { await db.updateProfile(currentUser.id, { show_bac_public: next }); } catch (err) { console.error(err); }
  };

  const togglePublicLeaderboard = async () => {
    const next = !publicLeaderboard;
    setPublicLeaderboard(next);
    try { await db.updateProfile(currentUser.id, { public_leaderboard: next }); } catch (err) { console.error(err); }
  };

  const toggleMarketingConsent = async () => {
    const next = !marketingConsent;
    setMarketingConsent(next);
    try { await db.recordMarketingConsent(currentUser.id, next); } catch (err) { console.error(err); }
  };

  // Sceglie come comparire agli altri: 'name' | 'username' | 'alias'.
  // Scrive anche use_username per retro-compatibilità con i percorsi non ancora migrati.
  const setNamePref = async (mode) => {
    setNameMode(mode);
    setAliasMsg('');
    try { await db.updateProfile(currentUser.id, { name_mode: mode, use_username: mode === 'username' }); } catch (err) { console.error(err); }
  };

  // Salva il nome di fantasia (alias). Se vuoto e modalità 'alias', torna al nome reale.
  const saveAlias = async () => {
    const value = alias.trim();
    setAliasMsg(''); setAliasErr(false);
    try {
      await db.updateProfile(currentUser.id, { alias: value || null });
      if (!value && nameMode === 'alias') { setNameMode('name'); await db.updateProfile(currentUser.id, { name_mode: 'name', use_username: false }); }
      setAliasMsg(t('settingspage.aliasSaved'));
      setTimeout(() => setAliasMsg(''), 2000);
    } catch (err) { setAliasErr(true); setAliasMsg(t('settingspage.errorPrefix') + (err.message || err)); }
  };

  const handleExportData = async () => {
    if (!currentUser) return;
    setExporting(true); setDataMsg(''); setDataErr('');
    try {
      const data = await db.exportMyData(currentUser.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `strabar-dati-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDataMsg(t('settingspage.exportDone'));
    } catch (err) {
      setDataErr(err.message || t('settingspage.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true); setDataErr('');
    try {
      await db.deleteMyAccount();
      window.dispatchEvent(new Event('auth-change'));
      router.push('/');
      router.refresh();
    } catch (err) {
      setDataErr(err.message || t('settingspage.deleteFailed'));
      setDeleting(false);
    }
  };

  const togglePush = async () => {
    setPushBusy(true);
    setPushMsg('');
    try {
      if (pushOn) {
        await db.unregisterPushSubscription();
        setPushOn(false);
        setPushMsg(t('settingspage.pushDisabled'));
      } else {
        const perm = await ensureNotificationPermission();
        if (perm !== 'granted') {
          setPushMsg(t('settingspage.pushPermDenied'));
          return;
        }
        await db.registerPushSubscription();
        const ok = await db.isPushSubscribed();
        setPushOn(ok);
        setPushMsg(ok ? t('settingspage.pushEnabled') : t('settingspage.pushEnableFailed'));
      }
    } catch (err) {
      setPushMsg(t('settingspage.errorPrefix') + (err.message || err));
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const user = await db.getCurrentUser();
        if (!user) { setLoading(false); return; }
        setCurrentUser(user);
        setDisplayName(user.display_name || '');
        setUsername(user.username || '');
        setAvatarUrl(user.avatar_url || '');
        if (user.notif_prefs) setNotifPrefs((p) => ({ ...p, ...user.notif_prefs }));
        if (user.marketing_consent !== null && user.marketing_consent !== undefined) setMarketingConsent(!!user.marketing_consent);
        setShowBacPublic(!!user.show_bac_public);
        setNameMode(user.name_mode || (user.use_username ? 'username' : 'name'));
        setAlias(user.alias || '');
        setPublicLeaderboard(user.public_leaderboard !== false); // default: visibile
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert(t('settingspage.invalidImage')); return; }
    setUploadingPhoto(true);
    try {
      const url = await db.uploadFileToStorage(file);
      setAvatarUrl(url);
    } catch (err) {
      alert(t('settingspage.photoUploadError') + (err.message || err));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileErr(''); setProfileMsg('');
    const name = displayName.trim();
    const uname = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!name) { setProfileErr(t('settingspage.enterName')); return; }
    if (uname.length < 3) { setProfileErr(t('settingspage.usernameMin')); return; }
    setSavingProfile(true);
    try {
      const all = typeof db.getAllProfiles === 'function' ? await db.getAllProfiles() : [];
      if (all.some((p) => p.username === uname && p.id !== currentUser.id)) {
        throw new Error(t('settingspage.usernameTaken'));
      }
      await db.updateProfile(currentUser.id, { display_name: name, username: uname, avatar_url: avatarUrl || null });
      const updated = await db.getCurrentUser();
      setCurrentUser(updated);
      window.dispatchEvent(new Event('auth-change'));
      setProfileMsg(t('settingspage.profileUpdated'));
    } catch (err) {
      setProfileErr(err.message || t('settingspage.saveError'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdErr(''); setPwdMsg('');
    if (password.length < 6) { setPwdErr(t('settingspage.pwdMin')); return; }
    if (password !== confirm) { setPwdErr(t('settingspage.pwdMismatch')); return; }
    setSavingPwd(true);
    try {
      await db.updatePassword(password);
      setPassword(''); setConfirm('');
      setPwdMsg(t('settingspage.pwdUpdated'));
    } catch (err) {
      setPwdErr(err.message || t('settingspage.pwdUpdateFailed'));
    } finally {
      setSavingPwd(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}><Loader size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} /></div>;
  }
  if (!currentUser) return <RequireAuth feature={t('settingspage.requireAuthFeature')} />;

  const inputStyle = { height: '46px', fontSize: '15px', paddingLeft: '44px' };
  const banner = (txt, ok) => (
    <div style={{ background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.15)', border: `1px solid ${ok ? '#10B981' : 'var(--error)'}`, color: ok ? '#6EE7B7' : '#FF7D7D', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: '14px', marginBottom: '14px' }}>{txt}</div>
  );

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900 }}>{t('settingspage.title')}</h1>
        <Link href="/profile" style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>{t('settingspage.backToProfile')}</Link>
      </div>

      {/* Foto + dati account */}
      <form onSubmit={handleSaveProfile} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800 }}>{t('settingspage.accountSection')}</h3>
        {profileErr && banner(profileErr, false)}
        {profileMsg && banner(profileMsg, true)}

        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="activity-avatar" style={{ width: 72, height: 72, fontSize: 28, overflow: 'hidden', flexShrink: 0 }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (displayName || 'U').charAt(0).toUpperCase()
            )}
          </div>
          <label className="btn btn-secondary" style={{ borderRadius: '20px', cursor: uploadingPhoto ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {uploadingPhoto ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={15} />}
            {avatarUrl ? t('settingspage.changePhoto') : t('settingspage.uploadPhoto')}
            <input type="file" accept="image/*" onChange={handlePhoto} disabled={uploadingPhoto} style={{ display: 'none' }} />
          </label>
          {avatarUrl && (
            <button type="button" onClick={() => setAvatarUrl('')} style={{ color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>{t('settingspage.removePhoto')}</button>
          )}
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">{t('settingspage.displayNameLabel')}</label>
          <div style={{ position: 'relative' }}>
            <User size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
            <input type="text" className="form-control" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">{t('settingspage.usernameLabel')}</label>
          <div style={{ position: 'relative' }}>
            <AtSign size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
            <input type="text" className="form-control" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} style={inputStyle} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={savingProfile} style={{ borderRadius: '24px', padding: '12px', fontWeight: 700 }}>
          {savingProfile ? t('settingspage.saving') : t('settingspage.saveProfile')}
        </button>
      </form>

      {/* Cambio password */}
      <form onSubmit={handleChangePassword} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}><Lock size={16} color="var(--primary)" /> {t('settingspage.changePasswordTitle')}</h3>
        {pwdErr && banner(pwdErr, false)}
        {pwdMsg && banner(pwdMsg, true)}
        <input type="password" className="form-control" placeholder={t('settingspage.newPasswordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} />
        <input type="password" className="form-control" placeholder={t('settingspage.confirmPasswordPlaceholder')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button type="submit" className="btn btn-secondary" disabled={savingPwd} style={{ borderRadius: '24px', padding: '12px', fontWeight: 700 }}>
          {savingPwd ? t('settingspage.updatingPwd') : t('settingspage.updatePassword')}
        </button>
      </form>

      {/* Notifiche push */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} color="var(--primary)" /> {t('settingspage.pushTitle')}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          {t('settingspage.pushDesc')}
        </p>
        {pushMsg && (
          <div style={{ fontSize: '13px', color: pushOn ? '#6EE7B7' : 'var(--text-dark-secondary)' }}>{pushMsg}</div>
        )}
        <button
          type="button"
          onClick={togglePush}
          disabled={pushBusy}
          className={`btn ${pushOn ? 'btn-secondary' : 'btn-primary'}`}
          style={{ borderRadius: '24px', padding: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          {pushBusy ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Bell size={15} />}
          {pushOn ? t('settingspage.pushToggleOff') : t('settingspage.pushToggleOn')}
        </button>

        {/* Quali notifiche ricevere */}
        <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '12px', marginTop: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '8px' }}>{t('settingspage.whichNotifs')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {NOTIF_TYPES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleNotifPref(key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                  background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px',
                  padding: '10px 12px', cursor: 'pointer', color: 'var(--text-dark-primary)', fontSize: '13px', fontWeight: 600,
                }}
              >
                <span>{label}</span>
                <span style={{
                  width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative',
                  background: notifPrefs[key] ? 'var(--primary)' : 'rgba(255,255,255,0.15)', transition: 'background .2s',
                }}>
                  <span style={{
                    position: 'absolute', top: 2, left: notifPrefs[key] ? 22 : 2, width: 20, height: 20, borderRadius: '50%',
                    background: '#fff', transition: 'left .2s',
                  }} />
                </span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '8px', marginBottom: 0 }}>
            {t('settingspage.notifPrefsNote')}
          </p>
        </div>

        {/* Promemoria foto: invito a scattare una foto al primo drink di una diretta */}
        <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '12px', marginTop: '4px' }}>
          <button
            type="button"
            onClick={togglePhotoPrompt}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%',
              background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px',
              padding: '10px 12px', cursor: 'pointer', color: 'var(--text-dark-primary)', fontSize: '13px', fontWeight: 600,
            }}
          >
            <span>{t('settingspage.photoPromptLabel')}</span>
            <span style={{
              width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative',
              background: photoPromptOn ? 'var(--primary)' : 'rgba(255,255,255,0.15)', transition: 'background .2s',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: photoPromptOn ? 22 : 2, width: 20, height: 20, borderRadius: '50%',
                background: '#fff', transition: 'left .2s',
              }} />
            </span>
          </button>
        </div>
      </div>

      {/* Privacy: come compaio agli altri (nome reale vs @username) */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          {t('settingspage.nameShowTitle')}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          {t('settingspage.nameShowDescPre')}<strong>{t('settingspage.nameShowDescBold1')}</strong>{t('settingspage.nameShowDescMid')}<strong>{t('settingspage.nameShowDescBold2')}</strong>{t('settingspage.nameShowDescPost')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { value: 'name', title: `${t('settingspage.nameOptNameTitle')}${displayName ? ` (${displayName})` : ''}`, sub: t('settingspage.nameOptNameSub') },
            { value: 'username', title: username ? `@${username}` : t('settingspage.nameOptUsernameTitle'), sub: t('settingspage.nameOptUsernameSub') },
            { value: 'alias', title: alias ? alias : t('settingspage.nameOptAliasTitle'), sub: t('settingspage.nameOptAliasSub') },
          ].map((opt) => {
            const active = nameMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setNamePref(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', textAlign: 'left',
                  background: 'var(--bg-input-dark)', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer',
                  color: 'var(--text-dark-primary)', border: active ? '1px solid var(--primary)' : '1px solid var(--border-dark)',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.title}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{opt.sub}</span>
                </span>
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: active ? '6px solid var(--primary)' : '2px solid var(--border-dark)',
                  background: active ? '#fff' : 'transparent', transition: 'all .15s',
                }} />
              </button>
            );
          })}
        </div>

        {/* Campo nome di fantasia */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label className="form-label" style={{ margin: 0 }}>{t('settingspage.aliasLabel')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-control"
              placeholder={t('settingspage.aliasPlaceholder')}
              value={alias}
              maxLength={40}
              onChange={(e) => setAlias(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={saveAlias} className="btn btn-secondary" style={{ borderRadius: '10px', padding: '0 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {t('settingspage.save')}
            </button>
          </div>
          {aliasMsg && <span style={{ fontSize: '12px', color: aliasErr ? 'var(--error)' : '#6EE7B7' }}>{aliasMsg}</span>}
          <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{t('settingspage.aliasHelp')}</span>
        </div>
      </div>

      {/* Privacy: tasso alcolico sul profilo pubblico */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          {t('settingspage.bacPrivacyTitle')}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          {t('settingspage.bacPrivacyDescPre')}<strong>{t('settingspage.bacPrivacyDescBold')}</strong>{t('settingspage.bacPrivacyDescPost')}
        </p>
        <button
          type="button"
          onClick={toggleShowBacPublic}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px',
            padding: '10px 12px', cursor: 'pointer', color: 'var(--text-dark-primary)', fontSize: '13px', fontWeight: 600,
          }}
        >
          <span>{t('settingspage.bacPrivacyToggle')}</span>
          <span style={{
            width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative',
            background: showBacPublic ? 'var(--primary)' : 'rgba(255,255,255,0.15)', transition: 'background .2s',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: showBacPublic ? 22 : 2, width: 20, height: 20, borderRadius: '50%',
              background: '#fff', transition: 'left .2s',
            }} />
          </span>
        </button>
      </div>

      {/* Privacy: nome nelle classifiche pubbliche */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          {t('settingspage.leaderboardTitle')}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          {t('settingspage.leaderboardDescPre')}<strong>{t('settingspage.leaderboardDescBold')}</strong>{t('settingspage.leaderboardDescPost')}
        </p>
        <button
          type="button"
          onClick={togglePublicLeaderboard}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px',
            padding: '10px 12px', cursor: 'pointer', color: 'var(--text-dark-primary)', fontSize: '13px', fontWeight: 600,
          }}
        >
          <span>{t('settingspage.leaderboardToggle')}</span>
          <span style={{
            width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative',
            background: publicLeaderboard ? 'var(--primary)' : 'rgba(255,255,255,0.15)', transition: 'background .2s',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: publicLeaderboard ? 22 : 2, width: 20, height: 20, borderRadius: '50%',
              background: '#fff', transition: 'left .2s',
            }} />
          </span>
        </button>
      </div>

      {/* Comunicazioni commerciali */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Megaphone size={16} color="var(--primary)" /> {t('settingspage.marketingTitle')}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          {t('settingspage.marketingDescPre')}<strong>{t('settingspage.marketingDescBold1')}</strong>{t('settingspage.marketingDescMid1')}<strong>{t('settingspage.marketingDescBold2')}</strong>{t('settingspage.marketingDescMid2')}<strong>{t('settingspage.marketingDescBold3')}</strong>{t('settingspage.marketingDescPost')}
        </p>
        <button
          type="button"
          onClick={toggleMarketingConsent}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px',
            padding: '10px 12px', cursor: 'pointer', color: 'var(--text-dark-primary)', fontSize: '13px', fontWeight: 600,
          }}
        >
          <span>{t('settingspage.marketingToggle')}</span>
          <span style={{
            width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative',
            background: marketingConsent ? 'var(--primary)' : 'rgba(255,255,255,0.15)', transition: 'background .2s',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: marketingConsent ? 22 : 2, width: 20, height: 20, borderRadius: '50%',
              background: '#fff', transition: 'left .2s',
            }} />
          </span>
        </button>
      </div>

      {/* GDPR: i tuoi dati (portabilità + diritto all'oblio) */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          {t('settingspage.dataTitle')}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          {t('settingspage.dataDesc')}
        </p>

        {dataMsg && <p style={{ fontSize: '13px', color: '#6EE7B7', margin: 0 }}>{dataMsg}</p>}
        {dataErr && <p style={{ fontSize: '13px', color: '#FF7D7D', margin: 0 }}>{dataErr}</p>}

        <button
          type="button"
          onClick={handleExportData}
          disabled={exporting}
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {exporting ? t('settingspage.exporting') : t('settingspage.downloadData')}
        </button>

        <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '12px', marginTop: '2px' }}>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => { setConfirmDelete(true); setDataErr(''); setDataMsg(''); }}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'none', border: '1px solid var(--error)', color: '#FF7D7D', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              {t('settingspage.deleteAccount')}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '13px', color: '#FF7D7D', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                {t('settingspage.deleteConfirmPre')}<strong>{t('settingspage.deleteConfirmBold')}</strong>{t('settingspage.deleteConfirmPost')}
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {t('settingspage.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--error)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {deleting ? t('settingspage.deleting') : t('settingspage.deleteForever')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
