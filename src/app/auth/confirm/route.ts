import { NextResponse, type NextRequest } from 'next/server'

/**
 * Point d'arrivée du lien de l'e-mail « Reset password » (spec #2 R50) :
 * `/auth/confirm?token_hash=…&type=recovery`. On **ne vérifie pas** le lien ici
 * (R52) — un robot de messagerie qui ouvre le lien le consommerait : on renvoie
 * vers l'écran « Nouveau mot de passe », qui le vérifiera à l'enregistrement.
 * Tout autre lien → connexion.
 */
export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const cible = request.nextUrl.clone()
  cible.search = ''

  if (searchParams.get('type') === 'recovery' && tokenHash) {
    cible.pathname = '/mot-de-passe/nouveau'
    cible.searchParams.set('token_hash', tokenHash)
  } else {
    cible.pathname = '/connexion'
  }
  return NextResponse.redirect(cible)
}
