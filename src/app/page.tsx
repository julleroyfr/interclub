import { redirect } from 'next/navigation'

import { Bouton, Carte, Etiquette } from '@/composants'
import { seDeconnecter } from '@/lib/auth/actions'
import { getUtilisateurCourant } from '@/lib/auth/session'

/**
 * Racine `/` : **routeur**, pas un écran (spec #12 R7). Non authentifié →
 * `/connexion` ; authentifié avec rôle → son espace (R6). Seul cas résiduel qui
 * rend un écran : un compte **authentifié sans rôle** (spec #2 R5, fail-closed) —
 * il n'a aucun espace où aller, on affiche un état minimal + déconnexion.
 */
export default async function Racine() {
  const utilisateur = await getUtilisateurCourant()
  if (!utilisateur) redirect('/connexion')
  if (utilisateur.role === 'admin') redirect('/admin')
  if (utilisateur.role === 'coach') redirect('/coach')

  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8 text-center">
        <h1 className="text-2xl font-semibold text-texte-fort">Interclub</h1>
        <p className="mt-4 text-sm text-texte-attenue">{utilisateur.email}</p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="text-sm text-texte-attenue">Rôle :</span>
          <Etiquette variante="neutre">aucun rôle attribué</Etiquette>
        </div>
        <p className="mt-4 text-sm text-texte-attenue">
          Votre compte n’a pas encore de rôle. Contactez votre administrateur.
        </p>
        <form action={seDeconnecter} className="mt-6 w-full">
          <Bouton type="submit" variante="secondaire" pleineLargeur>
            Se déconnecter
          </Bouton>
        </form>
      </Carte>
    </div>
  )
}
