import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  Carte,
  Coquille,
  EnTetePage,
  Etiquette,
  TitreSection,
  type LienNav,
} from '@/composants'
import { getUtilisateurCourant } from '@/lib/auth/session'
import {
  listerClubsEngages,
  listerJetonsActifs,
  listerRencontres,
  listerVoies,
} from '@/lib/jetons/jetons'

import { AfficheurJeton } from './afficheur-jeton'

export const metadata: Metadata = { title: 'Jetons QR — Interclub' }

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin/mapping', label: 'Rôles' },
  { href: '/admin/jetons', label: 'Jetons' },
]

const libellePhase: Record<string, string> = {
  pre_competition: 'Préparation',
  competition: 'Compétition ②',
  resultats_publics: 'Résultats',
}

export default async function PageJetonsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ rencontre?: string; erreur?: string }>
}) {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const { rencontre: rencontreId, erreur } = await searchParams
  const rencontres = await listerRencontres()
  const selection = rencontres.find((r) => r.id === rencontreId) ?? null

  return (
    <Coquille liens={liens} largeur="large">
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Jetons QR"
          sousTitre="Générez, affichez, révoquez ou régénérez les jetons d’une rencontre. Générer un jeton juge affecte le juge à sa voie."
        />

        {erreur && (
          <p role="alert" className="text-sm text-danger">
            L’opération a échoué ({erreur}). Un jeton est peut-être déjà actif sur
            ce périmètre.
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
                        {libellePhase[r.phase] ?? r.phase}
                      </Etiquette>
                    </Carte>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <SectionsRencontre rencontreId={selection.id} />
        )}
      </div>
    </Coquille>
  )
}

async function SectionsRencontre({ rencontreId }: { rencontreId: string }) {
  const [clubs, voies, jetons] = await Promise.all([
    listerClubsEngages(),
    listerVoies(rencontreId),
    listerJetonsActifs(rencontreId),
  ])
  const chemin = `/admin/jetons?rencontre=${rencontreId}`

  const jetonCoach = (clubId: string) =>
    jetons.find((j) => j.nature === 'coach_temporaire' && j.clubId === clubId) ?? null
  const jetonJuge = (voieId: string) =>
    jetons.find((j) => j.nature === 'juge' && j.voieVitesseId === voieId) ?? null

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <Link href="/admin/jetons" className="text-sm text-accent hover:underline">
          ← Rencontres
        </Link>
      </div>

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

      <section className="flex flex-col gap-3">
        <TitreSection>Juge (par voie de vitesse)</TitreSection>
        {voies.length === 0 ? (
          <p className="text-sm text-texte-attenue">
            Aucune voie de vitesse pour cette rencontre.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {voies.map((v) => (
              <AfficheurJeton
                key={v.id}
                titre={`Voie ${v.numero}`}
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
