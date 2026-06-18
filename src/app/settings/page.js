'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { User, AtSign, Camera, Lock, Loader, Check } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';

export default function SettingsPage() {
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

  useEffect(() => {
    (async () => {
      try {
        const user = await db.getCurrentUser();
        if (!user) { setLoading(false); return; }
        setCurrentUser(user);
        setDisplayName(user.display_name || '');
        setUsername(user.username || '');
        setAvatarUrl(user.avatar_url || '');
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
    if (!file.type.startsWith('image/')) { alert('Seleziona un\'immagine valida.'); return; }
    setUploadingPhoto(true);
    try {
      const url = await db.uploadFileToStorage(file);
      setAvatarUrl(url);
    } catch (err) {
      alert('Errore nel caricamento della foto: ' + (err.message || err));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileErr(''); setProfileMsg('');
    const name = displayName.trim();
    const uname = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!name) { setProfileErr('Inserisci il tuo nome.'); return; }
    if (uname.length < 3) { setProfileErr('Lo username deve avere almeno 3 caratteri.'); return; }
    setSavingProfile(true);
    try {
      const all = typeof db.getAllProfiles === 'function' ? await db.getAllProfiles() : [];
      if (all.some((p) => p.username === uname && p.id !== currentUser.id)) {
        throw new Error('Questo username è già occupato da un altro atleta.');
      }
      await db.updateProfile(currentUser.id, { display_name: name, username: uname, avatar_url: avatarUrl || null });
      const updated = await db.getCurrentUser();
      setCurrentUser(updated);
      window.dispatchEvent(new Event('auth-change'));
      setProfileMsg('Profilo aggiornato! ✅');
    } catch (err) {
      setProfileErr(err.message || 'Errore nel salvataggio.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdErr(''); setPwdMsg('');
    if (password.length < 6) { setPwdErr('La password deve avere almeno 6 caratteri.'); return; }
    if (password !== confirm) { setPwdErr('Le due password non coincidono.'); return; }
    setSavingPwd(true);
    try {
      await db.updatePassword(password);
      setPassword(''); setConfirm('');
      setPwdMsg('Password aggiornata! ✅');
    } catch (err) {
      setPwdErr(err.message || 'Impossibile aggiornare la password.');
    } finally {
      setSavingPwd(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}><Loader size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} /></div>;
  }
  if (!currentUser) return <RequireAuth feature="le impostazioni del profilo" />;

  const inputStyle = { height: '46px', fontSize: '15px', paddingLeft: '44px' };
  const banner = (txt, ok) => (
    <div style={{ background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.15)', border: `1px solid ${ok ? '#10B981' : 'var(--error)'}`, color: ok ? '#6EE7B7' : '#FF7D7D', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: '14px', marginBottom: '14px' }}>{txt}</div>
  );

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900 }}>⚙️ Impostazioni profilo</h1>
        <Link href="/profile" style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>← Profilo</Link>
      </div>

      {/* Foto + dati account */}
      <form onSubmit={handleSaveProfile} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Account</h3>
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
            {avatarUrl ? 'Cambia foto' : 'Carica foto'}
            <input type="file" accept="image/*" onChange={handlePhoto} disabled={uploadingPhoto} style={{ display: 'none' }} />
          </label>
          {avatarUrl && (
            <button type="button" onClick={() => setAvatarUrl('')} style={{ color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Rimuovi</button>
          )}
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nome visualizzato</label>
          <div style={{ position: 'relative' }}>
            <User size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
            <input type="text" className="form-control" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Username</label>
          <div style={{ position: 'relative' }}>
            <AtSign size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dark-secondary)' }} />
            <input type="text" className="form-control" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} style={inputStyle} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={savingProfile} style={{ borderRadius: '24px', padding: '12px', fontWeight: 700 }}>
          {savingProfile ? 'Salvataggio...' : 'Salva profilo'}
        </button>
      </form>

      {/* Cambio password */}
      <form onSubmit={handleChangePassword} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}><Lock size={16} color="var(--primary)" /> Cambia password</h3>
        {pwdErr && banner(pwdErr, false)}
        {pwdMsg && banner(pwdMsg, true)}
        <input type="password" className="form-control" placeholder="Nuova password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input type="password" className="form-control" placeholder="Conferma nuova password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button type="submit" className="btn btn-secondary" disabled={savingPwd} style={{ borderRadius: '24px', padding: '12px', fontWeight: 700 }}>
          {savingPwd ? 'Aggiornamento...' : 'Aggiorna password'}
        </button>
      </form>
    </div>
  );
}
