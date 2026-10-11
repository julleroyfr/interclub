import { readFileSync } from 'node:fs'

// Accès direct à l'API REST/Auth de la stack LOCALE, pour les vérifications RLS
// « négatives » (une écriture doit être refusée) — même esprit que
// scripts/test-t5*.sh, mais appelé depuis Playwright via le fixture `request`.
// URL + clé anon lues dans `.env.local` (mêmes valeurs que l'app dev).

let cache: { url: string; anon: string } | null = null

export function infosApi(): { url: string; anon: string } {
  if (cache) return cache
  const env = readFileSync('.env.local', 'utf8')
  const lire = (cle: string) =>
    env
      .match(new RegExp(`^${cle}=(.+)$`, 'm'))?.[1]
      .trim()
      .replace(/^["']|["']$/g, '') ?? ''
  cache = {
    url: lire('NEXT_PUBLIC_SUPABASE_URL'),
    anon: lire('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
  return cache
}
