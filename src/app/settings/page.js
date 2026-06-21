'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { User, AtSign, Camera, Lock, Loader, Check, Bell } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { ensureNotificationPermission } from '@/lib/notify';

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

  // Notifiche push (per utente, per dispositivo)
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');

  const NOTIF_TYPES = [
    { key: 'cheers', label: 'Mi piace (Cheers) ai tuoi brindisi' },
    { key: 'comment', label: 'Commenti ai tuoi brindisi' },
    { key: 'follow', label: 'Nuovi follower' },
    { key: 'events', label: 'Eventi e inviti' },
  ];
  const [notifPrefs, setNotifPrefs] = useState({ follow: true, cheers: true, comment: true, events: true });

  // Mostrare il proprio tasso alcolico attuale sul profilo pubblico (visibile agli altri)
  const [showBacPublic, setShowBacPublic] = useState(false);

  // GDPR: esportazione dati (portabilità) e cancellazione account (oblio)
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dataMsg, setDataMsg] = useState('');
  const [dataErr, setDataErr] = useState('');

  useEffect(() => {
    if (typeof db.isPushSubscribed === 'function') db.isPushSubscribed().then(setPushOn);
  }, []);

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
      setDataMsg('Esportazione completata: controlla i tuoi download.');
    } catch (err) {
      setDataErr(err.message || 'Esportazione non riuscita.');
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
      setDataErr(err.message || 'Cancellazione non riuscita.');
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
        setPushMsg('Notifiche disattivate su questo dispositivo.');
      } else {
        const perm = await ensureNotificationPermission();
        if (perm !== 'granted') {
          setPushMsg('Permesso negato dal browser. Abilita le notifiche per Strabar nelle impostazioni del dispositivo.');
          return;
        }
        await db.registerPushSubscription();
        const ok = await db.isPushSubscribed();
        setPushOn(ok);
        setPushMsg(ok ? 'Notifiche attivate! 🔔' : 'Non è stato possibile attivare le notifiche su questo dispositivo.');
      }
    } catch (err) {
      setPushMsg('Errore: ' + (err.message || err));
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
        setShowBacPublic(!!user.show_bac_public);
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

      {/* Notifiche push */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} color="var(--primary)" /> Notifiche push
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          Ricevi un avviso (anche ad app chiusa) quando qualcuno ti segue, mette un cheers, commenta o ti invita a un evento.
          Su iPhone funziona solo con l&apos;app installata nella schermata Home.
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
          {pushOn ? 'Disattiva notifiche su questo dispositivo' : 'Attiva notifiche su questo dispositivo'}
        </button>

        {/* Quali notifiche ricevere */}
        <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '12px', marginTop: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '8px' }}>Quali notifiche ricevere</span>
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
            Vale sia per le notifiche push sia per la campanella nell&apos;app.
          </p>
        </div>
      </div>

      {/* Privacy: tasso alcolico sul profilo pubblico */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          🍺 Privacy del tasso alcolico
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          Se attivo, gli altri atleti vedranno il tuo <strong>tasso alcolico stimato attuale</strong> quando visitano il tuo profilo. Di default è nascosto.
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
          <span>Mostra il mio tasso alcolico sul profilo</span>
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

      {/* GDPR: i tuoi dati (portabilità + diritto all'oblio) */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          🔐 I tuoi dati
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          Puoi scaricare una copia di tutti i tuoi dati o eliminare definitivamente il tuo account.
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
          {exporting ? 'Esportazione...' : '⬇️ Scarica i miei dati (JSON)'}
        </button>

        <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '12px', marginTop: '2px' }}>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => { setConfirmDelete(true); setDataErr(''); setDataMsg(''); }}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'none', border: '1px solid var(--error)', color: '#FF7D7D', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              🗑️ Elimina il mio account
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '13px', color: '#FF7D7D', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                Sei sicuro? L&apos;operazione è <strong>irreversibile</strong>: profilo, sessioni, percorsi, follow e commenti verranno eliminati per sempre.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--error)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {deleting ? 'Elimino...' : 'Elimina definitivamente'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
