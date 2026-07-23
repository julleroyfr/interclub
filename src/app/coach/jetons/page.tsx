import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  Coquille,
  EnTetePage,
  Etiquette,
  TitreSection,
  type LienNav,
} from '@/composants'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { listerJetonsActifs, listerRencontresDuClub } from '@/lib/jetons/jetons'

import { AfficheurJeton } from '../../admin/jetons/afficheur-jeton'

export const metadata: Metadata = { title: 'Mes jetons QR — Interclub' }

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/coach/jetons', label: 'Jetons' },
]

const libellePhase: Record<string, string> = {
  pre_competition: 'Préparation',
  competition: 'Compétition ②',
  resultats_publics: 'Résultats',
}

export default async function PageJetonsCoach({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>
}) {
  const utilisateur = await getUtilisateurCourant()
  // Réservé au coach permanent rattaché à un club (spec #2 R16).
  if (utilisateur?.role !== 'coach' || !utilisateur.clubId) notFound()
  const clubId = utilisateur.clubId

  const { erreur } = await searchParams
  const rencontres = await listerRencontresDuClub(clubId)
  const jetonsParRencontre = await Promise.all(
    rencontres.map((r) => listerJetonsActifs(r.id)),
  )

  return (
    <Coquille liens={liens}>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Mes jetons QR"
          sousTitre="Le jeton « coach temporaire » de votre club, pour chaque rencontre où il est engagé."
        />

        {erreur && (
          <p role="alert" className="text-sm text-danger">
            L’opération a échoué ({erreur}).
          </p>
        )}

        {rencontres.length === 0 ? (
          <p className="text-sm text-texte-attenue">
            Votre club n’est engagé dans aucune rencontre.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rencontres.map((r, i) => {
              const jeton =
                jetonsParRencontre[i].find(
                  (j) => j.nature === 'coach_temporaire' && j.clubId === clubId,
                ) ?? null
              return (
                <div key={r.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <TitreSection>{r.date}</TitreSection>
                    <Etiquette variante="neutre">
                      {libellePhase[r.phase] ?? r.phase}
                    </Etiquette>
                  </div>
                  <AfficheurJeton
                    titre={`${r.categorie}`}
                    chemin="/coach/jetons"
                    perimetre={{
                      rencontreId: r.id,
                      nature: 'coach_temporaire',
                      clubId,
                    }}
                    jeton={jeton}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Coquille>
  )
}
