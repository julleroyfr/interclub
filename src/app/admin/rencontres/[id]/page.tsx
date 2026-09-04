import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Carte, Coquille, EnTetePage, type LienNav } from '@/composants'
import { anneeSaison, CATEGORIES, labelSaison, type Categorie } from '@/domaine/rencontre'
import { chargerEngagementTousClubs } from '@/lib/admin/engagement'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { chargerPretsRencontre } from '@/lib/prets/prets'
import { getStructureRencontre } from '@/lib/rencontres/structure'

import { PanneauEquipes } from './panneau-equipes'
import { PanneauPilotage } from './panneau-pilotage'
import { PanneauPrets } from './panneau-prets'
import { PanneauStructure } from './panneau-structure'

export const metadata: Metadata = {
  title: 'Tableau de bord d’une rencontre — Interclub',
}

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin/rencontres', label: 'Rencontres' },
]

const labelCategorie = (v: Categorie) =>
  CATEGORIES.find((c) => c.value === v)?.labelCourt ?? v

/** Date ISO (AAAA-MM-JJ) affichée en français, sans dérive de fuseau. */
function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  if (!a || !m || !j) return iso
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(j))).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function PageTableauDeBordRencontre({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Écran réservé à l'admin (R40, spec #1 R12) : 404 pour les autres rôles.
  // La RLS reste la vraie frontière.
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const { id } = await params
  const structure = await getStructureRencontre(id)
  if (!structure) notFound()

  const { grimpeurs, clubs, prets } = await chargerPretsRencontre(id)
  const engagementClubs = await chargerEngagementTousClubs(id)
  const estEnfant = engagementClubs[0]?.engagement.categorie === 'enfant'

  // Compteurs du tableau de bord (R41).
  const nbEquipes = engagementClubs.reduce((n, c) => n + c.engagement.equipes.length, 0)
  const nbEpreuves =
    structure.epreuves.reduce((n, e) => n + e.voiesDifficulte.length + e.blocs.length, 0) +
    structure.voiesVitesse.length
  const nbPrets = prets.length

  return (
    <Coquille liens={liens} largeur="large">
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre={`Rencontre ${structure.clubPorteurNom} du ${formaterDate(structure.dateRencontre)}`}
          sousTitre={`${labelCategorie(structure.categorie)} · club porteur ${structure.clubPorteurNom} · saison ${labelSaison(anneeSaison(structure.dateRencontre))}`}
        />

        <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-6">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <PanneauPilotage
              rencontreId={id}
              phase={structure.phase}
              dateRencontre={structure.dateRencontre}
            />
            <Carte className="flex justify-between gap-3 p-4 text-center">
              <Stat k="Équipes" v={nbEquipes} />
              <Stat k="Épreuves" v={nbEpreuves} />
              <Stat k="Prêts" v={nbPrets} />
            </Carte>
          </aside>

          <div className="mt-4 flex flex-col gap-6 lg:mt-0 xl:grid xl:grid-cols-2 xl:items-start xl:gap-6">
            <div className="flex flex-col gap-6 xl:col-start-1">
              <PanneauStructure structure={structure} />
              <PanneauPrets
                rencontreId={id}
                grimpeurs={grimpeurs}
                clubs={clubs}
                prets={prets}
              />
            </div>
            <div className="xl:col-start-2">
              <PanneauEquipes rencontreId={id} estEnfant={estEnfant} clubs={engagementClubs} />
            </div>
          </div>
        </div>
      </div>
    </Coquille>
  )
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex-1">
      <div className="text-2xl font-bold text-texte-fort">{v}</div>
      <div className="text-xs uppercase tracking-wide text-texte-doux">{k}</div>
    </div>
  )
}
