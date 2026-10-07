import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { mesurer } from '@/lib/perf/mesure'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Rafraîchit la session — NE PAS ajouter de logique entre createServerClient et getClaims.
  // `getClaims` vérifie la signature du jeton LOCALEMENT (clés asymétriques mises
  // en cache) au lieu d'interroger le serveur d'authentification à chaque requête.
  await mesurer(`proxy getClaims ${request.nextUrl.pathname}`, () => supabase.auth.getClaims())

  return supabaseResponse
}
