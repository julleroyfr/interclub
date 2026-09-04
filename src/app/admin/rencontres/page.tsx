import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  Carte,
  Coquille,
  EnTetePage,
  TitreSection,
  type LienNav,
} from '@/composants'
import { anneeSaison, labelSaison } from '@/domaine/rencontre'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { listerClubsOptions, listerRencontres } from '@/lib/rencontres/rencontres'

import { FormulaireRencontre } from './formulaire-rencontre'
import { ListeRencontres } from './liste-rencontres'
import { SelecteurSaison } from './selecteur-saison'

export const metadata: Metadata = {
  title: 'Rencontres — Interclub',
}

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin/rencontres', label: 'Rencontres' },
]

export default async function PageRencontres({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // Paramétrage des rencontres réservé à l'admin (spec #1 R12). On masque
  // l'écran aux non-admins (404 plutôt que 403). La RLS reste la vraie frontière.
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const aujourd = new Date().toISOString().slice(0, 10)
  const saisonCourante = anneeSaison(aujourd)
  const { saison: saisonParam } = await searchParams
  const saison = typeof saisonParam === 'string' ? parseInt(saisonParam, 10) : saisonCourante

  const [rencontres, clubs] = await Promise.all([
    listerRencontres({ aujourdhui: aujourd, saison }),
    listerClubsOptions(),
  ])

  return (
    <Coquille liens={liens} largeur="large">
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TitreSection>
              Rencontres saison {labelSaison(saison)} ({rencontres.length})
            </TitreSection>
            <SelecteurSaison saison={saison} saisonCourante={saisonCourante} />
          </div>
          <ListeRencontres rencontres={rencontres} clubs={clubs} />
        </section>
      </div>
    </Coquille>
  )
}
