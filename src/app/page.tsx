import Link from 'next/link'

import { Bouton, Carte, Etiquette, Pastille } from '@/composants'
import { seDeconnecter } from '@/lib/auth/actions'
import { getUtilisateurCourant } from '@/lib/auth/session'

// Lien d'action secondaire, calqué sur le bouton « secondaire » du DS.
const lienSecondaire =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border ' +
  'border-bordure bg-surface px-4 text-sm font-semibold text-texte transition ' +
  'hover:bg-surface-forte focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-fond'

export default async function Accueil() {
  const utilisateur = await getUtilisateurCourant()

  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent/20 text-xl font-bold text-accent-doux ring-1 ring-accent/40">
          I
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-texte-fort">Interclub</h1>

        {utilisateur ? (
          <div className="mt-6 flex flex-col items-center gap-4">
            <p className="text-sm text-texte-attenue">{utilisateur.email}</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-texte-attenue">Rôle :</span>
              {utilisateur.role ? (
                <Etiquette variante="accent">{utilisateur.role}</Etiquette>
              ) : (
                <Etiquette variante="neutre">aucun rôle attribué</Etiquette>
              )}
            </div>
            {utilisateur.role === 'admin' && (
              <Link href="/admin" className={lienSecondaire}>
                Ouvrir le tableau de bord →
              </Link>
            )}
            {utilisateur.role === 'coach' && (
              <Link href="/coach/jetons" className={lienSecondaire}>
                Mes jetons QR
              </Link>
            )}
            <form action={seDeconnecter} className="w-full">
              <Bouton type="submit" variante="secondaire" pleineLargeur>
                Se déconnecter
              </Bouton>
            </form>
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-4">
            <p className="flex items-center gap-2 text-sm text-texte-attenue">
              <Pastille variante="neutre" />
              Session non authentifiée
            </p>
            <Link
              href="/connexion"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-slate-950 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-fond"
            >
              Se connecter
            </Link>
          </div>
        )}
      </Carte>
    </div>
  )
}
