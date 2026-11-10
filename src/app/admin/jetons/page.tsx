import type { Metadata } from 'next'
import Link from 'next/link'

import {
  Carte,
  Coquille,
  EnTetePage,
  Etiquette,
  TitreSection,
} from '@/composants'
import { libellePhase } from '@/domaine/rencontre'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'
import {
  listerClubsEngages,
  listerEquipesAdultes,
  listerJetonsActifs,
  listerRencontres,
  listerVoies,
} from '@/lib/jetons/jetons'

import { AfficheurJeton } from './afficheur-jeton'

export const metadata: Metadata = { title: 'QR codes — Interclub' }

export default async function PageJetonsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ rencontre?: string; erreur?: string }>
}) {
  await exigerAdmin()

  const { rencontre: rencontreId, erreur } = await searchParams
  // L'identifiant vient de l'URL : la liste et les sections de la rencontre
  // partent en une vague (lot 6, P10).
  const [rencontres, donnees] = await Promise.all([
    listerRencontres(),
    rencontreId ? chargerSections(rencontreId) : Promise.resolve(null),
  ])
  const selection = rencontres.find((r) => r.id === rencontreId) ?? null

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="QR codes"
          sousTitre="Générez, affichez, révoquez ou régénérez les QR codes d’une rencontre. Générer le QR code d’une voie de vitesse y affecte le juge qui le scanne."
        />

        {erreur && (
          <p role="alert" className="text-sm text-danger">
            L’opération a échoué ({erreur}). Un QR code est peut-être déjà actif
            pour ce club, cette voie ou cette équipe.
          </p>
        )}

        {!selection ? (
          <section className="flex flex-col gap-3">
            <TitreSection>Choisir une rencontre</TitreSection>
            {rencontres.length === 0 ? (
              <p className="text-sm text-texte-attenue">Aucune rencontre.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {rencontres.map((r) => (
                  <Link key={r.id} href={`/admin/jetons?rencontre=${r.id}`}>
                    <Carte interactive className="flex items-center justify-between p-4">
                      <span className="text-sm text-texte-fort">
                        {r.date} · {r.categorie}
                        {r.clubPorteurNom ? ` · ${r.clubPorteurNom}` : ''}
                      </span>
                      <Etiquette variante="neutre">
                        {libellePhase(r.phase)}
                      </Etiquette>
                    </Carte>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <SectionsRencontre
            rencontreId={selection.id}
            estAdulte={selection.categorie === 'adulte'}
            donnees={donnees!}
          />
        )}
      </div>
    </Coquille>
  )
}

/**
 * Données des sections d'une rencontre. La catégorie n'est pas encore connue :
 * clubs et équipes adultes sont lus tous deux, l'écran garde ceux qui servent.
 */
async function chargerSections(rencontreId: string) {
  const [clubs, equipes, { voies, vitesseDesactivee }, jetons] = await Promise.all([
    listerClubsEngages(),
    listerEquipesAdultes(rencontreId),
    listerVoies(rencontreId),
    listerJetonsActifs(rencontreId),
  ])
  return { clubs, equipes, voies, vitesseDesactivee, jetons }
}

function SectionsRencontre({
  rencontreId,
  estAdulte,
  donnees,
}: {
  rencontreId: string
  estAdulte: boolean
  donnees: Awaited<ReturnType<typeof chargerSections>>
}) {
  // Adulte : capitaines d'équipe, pas de coach temporaire (spec #20 R16, R20).
  const { voies, vitesseDesactivee, jetons } = donnees
  const clubs = estAdulte ? [] : donnees.clubs
  const equipes = estAdulte ? donnees.equipes : []
  const chemin = `/admin/jetons?rencontre=${rencontreId}`

  const jetonCoach = (clubId: string) =>
    jetons.find((j) => j.nature === 'coach_temporaire' && j.clubId === clubId) ?? null
  const jetonJuge = (voieId: string) =>
    jetons.find((j) => j.nature === 'juge' && j.voieVitesseId === voieId) ?? null
  const jetonCapitaine = (equipeId: string) =>
    jetons.find((j) => j.nature === 'capitaine' && j.equipeId === equipeId) ?? null

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <Link href="/admin/jetons" className="text-sm text-accent hover:underline">
          ← Rencontres
        </Link>
      </div>

      {estAdulte ? (
        <section className="flex flex-col gap-3">
          <TitreSection>Capitaines d’équipe</TitreSection>
          <p className="text-xs text-texte-attenue">
            Un QR code par équipe adulte. Il ne fonctionne qu’en compétition (③) et
            ne permet de saisir que les voies et blocs des membres de l’équipe.
          </p>
          {equipes.length === 0 ? (
            <p className="text-sm text-texte-attenue">
              Aucune équipe : créez-les depuis le tableau de bord de la rencontre.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {equipes.map((e) => (
                <AfficheurJeton
                  key={e.id}
                  titre={e.nom}
                  chemin={chemin}
                  perimetre={{ rencontreId, nature: 'capitaine', equipeId: e.id }}
                  jeton={jetonCapitaine(e.id)}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <TitreSection>Coach temporaire (par club)</TitreSection>
          {clubs.length === 0 ? (
            <p className="text-sm text-texte-attenue">Aucun club engagé.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clubs.map((c) => (
                <AfficheurJeton
                  key={c.id}
                  titre={c.nom}
                  chemin={chemin}
                  perimetre={{ rencontreId, nature: 'coach_temporaire', clubId: c.id }}
                  jeton={jetonCoach(c.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <TitreSection>Juge (par voie de vitesse)</TitreSection>
        {vitesseDesactivee ? (
          // Épreuve de vitesse désactivée (adulte) : aucun jeton juge (spec #20 R39).
          <p className="text-sm text-texte-attenue">
            Épreuve de vitesse désactivée : aucun QR code juge.
          </p>
        ) : voies.length === 0 ? (
          <p className="text-sm text-texte-attenue">
            Aucune voie de vitesse pour cette rencontre.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {voies.map((v) => (
              <AfficheurJeton
                key={v.id}
                // Libellé de la voie (spec #3 R32, spec #20 R9bis).
                titre={v.libelle ?? `Voie ${v.numero}`}
                chemin={chemin}
                perimetre={{ rencontreId, nature: 'juge', voieVitesseId: v.id }}
                jeton={jetonJuge(v.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
