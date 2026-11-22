import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Carte, EnTetePage } from '@/composants'

import { FormulaireNouveauMotDePasse } from './formulaire-nouveau-mot-de-passe'

export const metadata: Metadata = {
  title: 'Nouveau mot de passe — Interclub',
  // Le lien porte un secret à usage unique : ne pas le transmettre en Referer.
  referrer: 'no-referrer',
}

/**
 * Écran « Nouveau mot de passe » (spec #2 R51–R53), ouvert par le lien reçu par
 * e-mail. Le lien n'est **pas** vérifié ici (R52) : un robot de messagerie qui
 * l'ouvre ne le consomme pas ; il l'est à l'enregistrement. Sans lien → retour
 * à la demande (R53).
 */
export default async function PageNouveauMotDePasse({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>
}) {
  const { token_hash: tokenHash } = await searchParams
  if (!tokenHash) redirect('/mot-de-passe-oublie')

  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8">
        <EnTetePage
          titre="Nouveau mot de passe"
          sousTitre="Choisissez votre nouveau mot de passe (au moins 6 caractères)."
        />
        <FormulaireNouveauMotDePasse tokenHash={tokenHash} />
      </Carte>
    </div>
  )
}
