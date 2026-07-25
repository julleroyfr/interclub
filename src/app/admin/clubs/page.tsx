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
import { listerClubs } from '@/lib/clubs/clubs'

import { FormulaireClub } from './formulaire-club'
import { ListeClubs } from './liste-clubs'

export const metadata: Metadata = {
  title: 'Clubs — Interclub',
}

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin/clubs', label: 'Clubs' },
]

export default async function PageClubs() {
  // Paramétrage des clubs réservé à l'admin (spec #1 R11). On masque l'écran aux
  // non-admins (404 plutôt que 403). La RLS reste la vraie frontière.
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const clubs = await listerClubs()

  return (
    <Coquille liens={liens}>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Clubs"
          sousTitre="Créez et gérez les clubs de la compétition."
        />

        <Carte className="max-w-xl p-6">
          <TitreSection>Nouveau club</TitreSection>
          <FormulaireClub />
        </Carte>

        <section className="flex flex-col gap-3">
          <TitreSection>Clubs ({clubs.length})</TitreSection>
          <ListeClubs clubs={clubs} />
        </section>
      </div>
    </Coquille>
  )
}
