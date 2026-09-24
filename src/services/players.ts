// Magasin de profils utilisé par l'appli : local + envoi automatique vers le
// compte en ligne quand le profil y est lié.
import { localPlayerStore } from './playerStore';
import { withCloudSync } from './sync';

export const playerStore = withCloudSync(localPlayerStore, (e) => {
  // Hors ligne ou session expirée : la file est conservée et renvoyée plus tard.
  console.warn('[compte en ligne] envoi différé :', e);
});
