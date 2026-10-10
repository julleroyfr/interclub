import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { fetchSupabase } from './trace'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Le métier vit dans le schéma `interclub` (convention 03 §2bis) : on le
      // prend comme schéma par défaut pour `.from(...)` / `.rpc(...)`.
      db: { schema: 'interclub' },
      // Traçage des appels, hors production (`SUPABASE_TRACE=1`, cf. `trace.ts`).
      global: { fetch: fetchSupabase() },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll appelé depuis un Server Component — ignoré si middleware gère le refresh
          }
        },
      },
    }
  )
}
