import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  Cellule,
  CelluleTete,
  Coquille,
  CorpsTableau,
  EnTetePage,
  LigneTableau,
  Tableau,
  TeteTableau,
} from '@/composants'
import { tableauAideGroupes } from '@/domaine/engagement'
import { exigerContexteCoach } from '@/lib/auth/session'
import { liensCoach } from '@/lib/coach/navigation'

export const metadata: Metadata = { title: 'Aide au choix du groupe — Interclub' }

/** Identifiant de rencontre accepté pour le lien de retour (uuid). */
const ID_RENCONTRE = /^[0-9a-f-]{36}$/i

/**
 * Aide au choix du groupe de départ (spec #5 R21ter) : tableau « Aide à la
 * décision des Groupes de Niveau » du CT33, en lecture seule. Réservée au coach
 * permanent ; ouverte par le « ? » de l'écran d'engagement enfant, vers lequel
 * elle renvoie (spec #12 R19), à défaut vers « Mes rencontres ».
 */
export default async function PageAideGroupes({
  searchParams,
}: {
  searchParams: Promise<{ rencontre?: string }>
}) {
  const contexte = await exigerContexteCoach()
  if (contexte.type !== 'permanent') notFound()

  const { rencontre } = await searchParams
  const retour =
    rencontre && ID_RENCONTRE.test(rencontre)
      ? { href: `/coach/rencontres/${rencontre}`, label: '← Retour à la rencontre' }
      : { href: '/coach', label: '← Mes rencontres' }
  const tirets = (v: string | null) => v ?? '–'

  return (
    <Coquille liens={liensCoach(contexte)} deconnexion>
      <div className="flex flex-col gap-6">
        <div>
          <Link
            href={retour.href}
            className="text-sm font-semibold text-accent-doux underline-offset-2 hover:underline"
          >
            {retour.label}
          </Link>
          <EnTetePage
            titre="Aide au choix du groupe"
            sousTitre="Aide à la décision des groupes de niveau (rencontres enfant) : choisissez le groupe selon la cotation maximale que l’enfant réussit en moulinette ou en tête."
          />
        </div>

        {/* Libellés courts sur mobile : les 5 colonnes tiennent en 375 px. */}
        <Tableau>
          <TeteTableau>
            <tr>
              <CelluleTete className="text-center max-sm:px-1.5">
                <span className="sm:hidden">N°</span>
                <span className="hidden sm:inline">Groupe</span>
              </CelluleTete>
              <CelluleTete className="text-center max-sm:px-1.5">
                <span className="sm:hidden">Départ</span>
                <span className="hidden sm:inline">Niveau de départ</span>
              </CelluleTete>
              <CelluleTete className="text-center max-sm:px-1.5">
                <span className="sm:hidden">Max moul.</span>
                <span className="hidden sm:inline">Cotation max en moulinette</span>
              </CelluleTete>
              <CelluleTete className="text-center max-sm:px-1.5">
                <span className="sm:hidden">Max tête</span>
                <span className="hidden sm:inline">Cotation max en tête</span>
              </CelluleTete>
              <CelluleTete className="text-center max-sm:px-1.5">
                <span className="sm:hidden">Voies</span>
                <span className="hidden sm:inline">Voies à réaliser</span>
              </CelluleTete>
            </tr>
          </TeteTableau>
          <CorpsTableau>
            {tableauAideGroupes().map((l) => (
              <LigneTableau
                key={l.niveau}
                // Séparation moulinette / tête après le groupe 4 (M4).
                className={l.niveau === 'M4' ? 'border-b-2 border-bordure' : ''}
              >
                <Cellule className="text-center max-sm:px-1.5 font-bold text-texte-fort">{l.numero}</Cellule>
                <Cellule className="text-center max-sm:px-1.5">{l.niveau}</Cellule>
                <Cellule className="text-center max-sm:px-1.5">{tirets(l.cotationMaxMoulinette)}</Cellule>
                <Cellule className="text-center max-sm:px-1.5">{tirets(l.cotationMaxTete)}</Cellule>
                <Cellule className="whitespace-nowrap text-center max-sm:px-1.5 max-sm:text-xs">{l.voies.join(', ')}</Cellule>
              </LigneTableau>
            ))}
          </CorpsTableau>
        </Tableau>
      </div>
    </Coquille>
  )
}
