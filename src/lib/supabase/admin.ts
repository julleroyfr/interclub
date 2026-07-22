import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase à privilèges **service_role** — réservé au serveur.
 *
 * Contourne la RLS : à n'utiliser QUE pour ce que la RLS ne peut pas faire côté
 * `authenticated`, et TOUJOURS derrière une garde de rôle applicatif (admin).
 * Aujourd'hui : lister les comptes Supabase (`auth.admin`) et lire le catalogue
 * `interclub.club` (pas encore ouvert en RLS, cf. T6) pour l'écran de mapping.
 *
 * ⚠️ Ne JAMAIS importer ce module dans un Client Component : la clé service ne
 * doit jamais atteindre le navigateur. Cf. ADR 0002.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_URL) manquant : ' +
        "l'administration du mapping de rôle est indisponible.",
    )
  }

  return createClient(url, serviceKey, {
    // Métier dans le schéma `interclub` (convention 03 §2bis).
    db: { schema: 'interclub' },
    // Client sans session : aucun cookie, aucun refresh, pas de persistance.
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
