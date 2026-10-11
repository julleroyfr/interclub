import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Schéma métier par défaut (convention 03 §2bis) : `.from(...)` / `.rpc(...)`
      // ciblent `interclub` sans le préfixer à chaque appel.
      db: { schema: 'interclub' },
    }
  )
}
