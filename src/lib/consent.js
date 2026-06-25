// Versione corrente dei documenti (Termini di Servizio + Privacy Policy).
// Aggiornala quando modifichi quei documenti: il valore viene registrato sul
// profilo (profiles.consent_version) per tracciare a COSA l'utente ha acconsentito.
// Usata sia alla registrazione (auth) sia nel gate post-login (OnboardingGate)
// che chiede il consenso a chi non l'ha ancora dato (vecchi utenti, login Google).
export const CONSENT_VERSION = '2026-06-25';
