// Création du client Supabase, dans un fichier séparé pour que la
// bibliothèque soit chargée à part (voir getCloud dans cloud.ts).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createCloudClient(url: string, key: string, onRecovery: () => void): SupabaseClient {
  const client = createClient(url, key, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') onRecovery();
  });
  return client;
}
