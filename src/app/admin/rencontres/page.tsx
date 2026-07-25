import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  Carte,
  Coquille,
  EnTetePage,
  TitreSection,
  type LienNav,
} from '@/composants'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { listerClubsOptions, listerRencontres } from '@/lib/rencontres/rencontres'

import { FormulaireRencontre } from './formulaire-rencontre'
import { ListeRencontres } from './liste-rencontres'

export const metadata: Metadata = {
  title: 'Rencontres — Interclub',
}

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin/rencontres', label: 'Rencontres' },
]

export default async function PageRencontres() {
  // Paramétrage des rencontres réservé à l'admin (spec #1 R12). On masque
  // l'écran aux non-admins (404 plutôt que 403). La RLS reste la vraie frontière.
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const [rencontres, clubs] = await Promise.all([
    listerRencontres(),
    listerClubsOptions(),
  ])

  return (
    <Coquille liens={liens}>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Rencontres"
          sousTitre="Programmez et gérez les rencontres de la compétition."
        />

        {clubs.length === 0 ? (
          <Carte className="max-w-xl p-6">
            <p className="text-sm text-texte-attenue">
              Créez d’abord un club porteur pour programmer une rencontre.
            </p>
          </Carte>
        ) : (
          <Carte className="max-w-xl p-6">
            <TitreSection>Nouvelle rencontre</TitreSection>
            <FormulaireRencontre clubs={clubs} />
          </Carte>
        )}

        <section className="flex flex-col gap-3">
          <TitreSection>Rencontres ({rencontres.length})</TitreSection>
          <ListeRencontres rencontres={rencontres} clubs={clubs} />
        </section>
      </div>
    </Coquille>
  )
}
