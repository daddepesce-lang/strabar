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

// Username pubblico da mostrare ACCANTO al nome (es. "@mario" sotto il nome nelle liste).
// Va NASCOSTO per chi ha scelto un ALIAS: mostrarlo svelerebbe l'identità che l'alias
// vuole coprire. Per gli altri (nome reale o già @username) è ok mostrarlo.
export function publicUsername(p) {
  if (!p) return null;
  const mode = p.name_mode || (p.use_username ? 'username' : 'name');
  if (mode === 'alias') return null;
  return p.username || null;
}
