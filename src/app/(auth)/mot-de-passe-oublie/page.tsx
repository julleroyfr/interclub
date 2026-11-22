import type { Metadata } from 'next'
import Link from 'next/link'

import { Carte, EnTetePage } from '@/composants'
import { redirigerSiConnecte } from '@/lib/auth/session'

import { FormulaireDemande } from './formulaire-demande'

export const metadata: Metadata = {
  title: 'Mot de passe oublié — Interclub',
}

/** Demande de réinitialisation du mot de passe (spec #2 R48, R49). */
export default async function PageMotDePasseOublie() {
  // Déjà connecté avec un rôle → renvoi vers son espace (spec #12 R8).
  await redirigerSiConnecte()

  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8">
        <EnTetePage
          titre="Mot de passe oublié"
          sousTitre="Saisissez l’adresse de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe."
        />
        <FormulaireDemande />
        <p className="mt-6 text-sm text-texte-attenue">
          <Link href="/connexion" className="text-accent hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </Carte>
    </div>
  )
}
