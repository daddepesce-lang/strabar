// Nome pubblico di un profilo, rispettando la preferenza dell'utente
// (impostazioni → "Come compaio agli altri"): nome reale oppure @username.
// Usare OVUNQUE si mostra il nome di un altro utente nel pubblico: feed,
// classifiche, profilo pubblico. Il profilo deve includere il campo `use_username`
// (aggiungilo ai SELECT che fanno join su profiles).
export function publicName(p, fallback = 'Atleta Strabar') {
  if (!p) return fallback;
  if (p.use_username && p.username) return `@${p.username}`;
  return p.display_name || (p.username ? `@${p.username}` : fallback);
}
