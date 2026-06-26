// Nome pubblico di un profilo, rispettando la preferenza dell'utente
// (impostazioni → "Come compaio agli altri"): nome reale, @username o nome di fantasia (alias).
// Usare OVUNQUE si mostra il nome di un altro utente nel pubblico: feed, classifiche,
// profilo pubblico. Il profilo dovrebbe includere `name_mode` e `alias` nei SELECT
// (in mancanza, fallback compatibile su `use_username` → nome reale o @username).
export function publicName(p, fallback = 'Atleta Strabar') {
  if (!p) return fallback;
  const mode = p.name_mode || (p.use_username ? 'username' : 'name');
  if (mode === 'username' && p.username) return `@${p.username}`;
  if (mode === 'alias' && p.alias) return p.alias;
  return p.display_name || (p.username ? `@${p.username}` : fallback);
}
