'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Beer, Plus, Minus, Calendar, Clock, Heart, Users, Save, Trash2 } from 'lucide-react';

const PRESET_DRINKS = [
  { name: 'Spritz (Campari/Aperol/Select)', abv: 11, volumeMl: 150, category: 'Aperitivo', units: 1.3 },
  { name: 'Birra Chiara Media', abv: 5, volumeMl: 400, category: 'Birra', units: 1.6 },
  { name: 'Birra IPA Artigianale', abv: 6.5, volumeMl: 400, category: 'Birra', units: 2.1 },
  { name: 'Calice Vino (Rosso/Bianco/Prosecco)', abv: 12.5, volumeMl: 125, category: 'Vino', units: 1.3 },
  { name: 'Cocktail (Gin Tonic/Negroni/Moscow Mule)', abv: 25, volumeMl: 150, category: 'Cocktail', units: 2.5 },
  { name: 'Shot (Tequila/Rhum/Chupito)', abv: 40, volumeMl: 40, category: 'Shot', units: 1.3 }
];

export default function LogActivityPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(120); // 2 ore di default
  const [feeling, setFeeling] = useState('Brillo Felice');
  
  // Lista dei drink aggiunti in questa sessione
  const [loggedDrinks, setLoggedDrinks] = useState([
    { name: PRESET_DRINKS[0].name, qty: 1, abv: PRESET_DRINKS[0].abv, units: PRESET_DRINKS[0].units }
  ]);
  
  // Stato per taggare gli amici
  const [friendName, setFriendName] = useState('');
  const [taggedFriends, setTaggedFriends] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkUser = async () => {
      const user = await db.getCurrentUser();
      if (!user) {
        router.push('/auth');
      } else {
        setCurrentUser(user);
      }
    };
    checkUser();
  }, [router]);

  // Calcola le unità alcoliche totali in tempo reale
  const totalUnits = loggedDrinks.reduce((acc, drink) => {
    return acc + (drink.units * drink.qty);
  }, 0).toFixed(1);

  const handleAddPresetDrink = (preset) => {
    const existingIdx = loggedDrinks.findIndex(d => d.name === preset.name);
    if (existingIdx > -1) {
      const updated = [...loggedDrinks];
      updated[existingIdx].qty += 1;
      setLoggedDrinks(updated);
    } else {
      setLoggedDrinks([...loggedDrinks, { name: preset.name, qty: 1, abv: preset.abv, units: preset.units }]);
    }
  };

  const handleUpdateQty = (index, increment) => {
    const updated = [...loggedDrinks];
    updated[index].qty += increment;
    if (updated[index].qty <= 0) {
      updated.splice(index, 1);
    }
    setLoggedDrinks(updated);
  };

  const handleCustomDrinkAdd = (e) => {
    e.preventDefault();
    const name = e.target.customName.value;
    const abv = parseFloat(e.target.customAbv.value || 5);
    const volume = parseFloat(e.target.customVolume.value || 330);
    
    if (!name) return;

    // Calcolo approssimativo unità: volume(L) * abv% * 10
    const calculatedUnits = ((volume / 1000) * abv * 0.8 * 10) / 8; // standard units index
    const units = parseFloat(calculatedUnits.toFixed(2));

    setLoggedDrinks([...loggedDrinks, { name, qty: 1, abv, units }]);
    e.target.reset();
  };

  const handleAddFriend = (e) => {
    e.preventDefault();
    if (friendName.trim() && !taggedFriends.includes(friendName.trim())) {
      setTaggedFriends([...taggedFriends, friendName.trim()]);
      setFriendName('');
    }
  };

  const handleRemoveFriend = (name) => {
    setTaggedFriends(taggedFriends.filter(f => f !== name));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loggedDrinks.length === 0) {
      setError("Inserisci almeno un drink consumato!");
      return;
    }

    setLoading(true);
    setError('');

    const activityData = {
      title: title || 'Aperitivo Strabar 🍻',
      description,
      duration,
      feeling,
      drinks: loggedDrinks,
      total_units: totalUnits,
      drank_with: taggedFriends
    };

    try {
      await db.createActivity(activityData);
      router.push('/');
    } catch (err) {
      setError(err.message || "Impossibile salvare l'attività.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Beer size={32} color="var(--primary)" fill="var(--primary)" />
        Registra una Sessione Alcolica
      </h1>
      <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '30px' }}>
        Tieni traccia delle tue bevute, tagga gli amici e calcola le tue statistiche, proprio come faresti con un allenamento.
      </p>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--error)', color: '#FF7D7D', padding: '12px 16px', borderRadius: 'var(--radius)', fontSize: '14px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '30px' }}>
        {/* Colonna Sinistra: Modulo principale */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
              Dettagli Attività
            </h3>
            
            <div className="form-group">
              <label className="form-label">Titolo Bevuta</label>
              <input
                type="text"
                className="form-control"
                placeholder="es. Aperitivo Ignorante, Terzo Tempo Calcetto"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Note / Descrizione della serata</label>
              <textarea
                className="form-control"
                placeholder="Racconta com'è andata la serata, cosa hai mangiato, aneddoti divertenti..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Durata (minuti)</label>
                <div style={{ position: 'relative' }}>
                  <Clock size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-dark-secondary)' }} />
                  <input
                    type="number"
                    className="form-control"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                    style={{ paddingLeft: '40px' }}
                    min={1}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Stato d&apos;animo / Livello</label>
                <select
                  className="form-control"
                  value={feeling}
                  onChange={(e) => setFeeling(e.target.value)}
                  required
                >
                  <option value="Sobrio">Sobrio / Autista</option>
                  <option value="Allegro">Allegro</option>
                  <option value="Brillo Felice">Brillo Felice</option>
                  <option value="Intenditore">Intenditore di Cantina</option>
                  <option value="Molto Caldo">Molto Caldo 🔥</option>
                  <option value="Pieno raso">Pieno Raso 💀</option>
                  <option value="Postumi Assicurati">Postumi Assicurati 🤕</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sezione Selettore Drink */}
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
              Drink Consumati
            </h3>

            {/* List of current session's logged drinks */}
            {loggedDrinks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed var(--border-dark)', marginBottom: '20px' }}>
                <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Nessun drink aggiunto ancora. Seleziona dai preset qui a destra.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                {loggedDrinks.map((drink, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', background: 'var(--bg-input-dark)', borderRadius: 'var(--radius)', border: '1px solid var(--border-dark)' }}>
                    <div>
                      <strong style={{ fontSize: '15px' }}>{drink.name}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
                        Gradazione: {drink.abv}% | Unità: {(drink.units * drink.qty).toFixed(1)} U.A.
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <button type="button" onClick={() => handleUpdateQty(idx, -1)} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                        <Minus size={14} />
                      </button>
                      <strong style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{drink.qty}</strong>
                      <button type="button" onClick={() => handleUpdateQty(idx, 1)} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Custom Drink Add Form */}
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-dark-secondary)', marginBottom: '10px', textTransform: 'uppercase' }}>Aggiungi Drink Personalizzato</h4>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
              <form onSubmit={handleCustomDrinkAdd} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Nome Drink</label>
                  <input name="customName" type="text" className="form-control" placeholder="es. Grappa di vitigno" style={{ height: '38px', fontSize: '13px' }} required />
                </div>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', fontWeight: '600' }}>ABV %</label>
                  <input name="customAbv" type="number" step="0.1" className="form-control" placeholder="40" style={{ height: '38px', fontSize: '13px' }} required />
                </div>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Vol (ml)</label>
                  <input name="customVolume" type="number" className="form-control" placeholder="40" style={{ height: '38px', fontSize: '13px' }} required />
                </div>
                <button type="submit" className="btn btn-secondary" style={{ height: '38px', padding: '0 15px', fontSize: '13px' }}>
                  Aggiungi
                </button>
              </form>
            </div>
          </div>

          {/* Sezione Compagnia / Tag Amici */}
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
              Ha bevuto con...
            </h3>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Users size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-dark-secondary)' }} />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Inserisci il nome del compagno di brindisi"
                  value={friendName}
                  onChange={(e) => setFriendName(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                />
              </div>
              <button type="button" onClick={handleAddFriend} className="btn btn-secondary" style={{ borderRadius: 'var(--radius)' }}>
                Tagga
              </button>
            </div>

            {taggedFriends.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {taggedFriends.map((friend, idx) => (
                  <span key={idx} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-dark)', padding: '6px 12px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '500' }}>
                    {friend}
                    <button type="button" onClick={() => handleRemoveFriend(friend)} style={{ cursor: 'pointer', display: 'inline-flex', color: 'var(--error)' }}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '16px', borderRadius: '30px', fontSize: '18px' }} disabled={loading}>
            <Save size={18} /> {loading ? 'Salvataggio...' : 'Salva Attività su Strabar'}
          </button>
        </form>

        {/* Colonna Destra: Quick presets & Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Calcolatore Live Stats (Strava Style) */}
          <div className="card" style={{ border: '2px solid var(--primary)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '15px', color: 'var(--primary)' }}>
              Live Stats 📊
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>
                  Stima Unità Alcoliche (U.A.)
                </span>
                <div style={{ fontSize: '36px', fontWeight: '800', color: '#FFF' }}>
                  {totalUnits}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                  1 Unità Alcolica (U.A.) corrisponde a circa 10 grammi di alcol puro.
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '15px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>
                  Intensità Sforzo (Stima BAC)
                </span>
                <div style={{ fontSize: '16px', fontWeight: '700', marginTop: '5px', color: parseFloat(totalUnits) > 5 ? 'var(--error)' : parseFloat(totalUnits) > 2.5 ? 'var(--primary)' : 'var(--success)' }}>
                  {parseFloat(totalUnits) === 0 ? 'Sobrio 🟢' : parseFloat(totalUnits) < 2.5 ? 'Leggero (Brillo) 🟡' : parseFloat(totalUnits) < 5 ? 'Medio (Caldo) 🟠' : 'Massimo Sforzo (Pieno) 🔴'}
                </div>
              </div>
            </div>
          </div>

          {/* Preset dei Drink Comuni */}
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px' }}>
              Drink Comuni 🍺
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '15px' }}>
              Clicca per aggiungere istantaneamente un drink alla tua sessione.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {PRESET_DRINKS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddPresetDrink(preset)}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: '13px', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Beer size={14} color="var(--primary)" />
                    <div>
                      <strong>{preset.name}</strong>
                      <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{preset.category} | {preset.volumeMl}ml</div>
                    </div>
                  </div>
                  <span style={{ background: 'rgba(255, 94, 0, 0.1)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '10px', fontWeight: '700', fontSize: '11px' }}>
                    +{preset.units}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
