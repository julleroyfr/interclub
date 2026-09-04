import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Carte, Coquille, EnTetePage, type LienNav } from '@/composants'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { chargerTableauDeBord } from '@/lib/tableau-de-bord/tableau-de-bord'

import { CarteRencontres } from './carte-rencontres'

export const metadata: Metadata = {
  title: 'Tableau de bord — Interclub',
}

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin', label: 'Tableau de bord' },
]

export default async function PageTableauDeBord() {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const aujourdhui = new Date().toISOString().slice(0, 10)
  const { stats, rencontres, totalRencontres, saison } = await chargerTableauDeBord(aujourdhui)

  return (
    <Coquille liens={liens} largeur="large">
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Tableau de bord"
          sousTitre="Vue d'ensemble de la compétition."
        />

        {/* Bandeau statistiques (R13) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CarteStatistique libelle="Clubs" valeur={stats.nbClubs} />
          <CarteStatistique libelle="Rencontres" valeur={stats.nbRencontres} />
          <CarteStatistique libelle="Grimpeurs" valeur={stats.nbGrimpeurs} />
          <CarteStatistique
            libelle="En compétition"
            valeur={stats.nbRencontresEnCompetition}
            accent
          />
        </div>

        {/* Grille principale : carte Rencontres (large) + cartes d'accès (colonne) */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_260px]">
          {/* Carte Rencontres — élément principal (R3, R5–R11) */}
          <CarteRencontres
            rencontres={rencontres}
            totalRencontres={totalRencontres}
            saison={saison}
          />

          {/* Cartes d'accès secondaires (R12) */}
          <div className="flex flex-col gap-3">
            <CarteAcces
              titre="Clubs"
              href="/admin/clubs"
              compteur={stats.nbClubs}
              unite="club"
            />
            <CarteAcces
              titre="Grimpeurs"
              href="/admin/grimpeurs"
              compteur={stats.nbGrimpeurs}
              unite="grimpeur"
            />
            <Carte className="flex flex-col gap-2 p-4">
              <p className="text-sm font-semibold text-texte-fort">Accès</p>
              <nav className="flex flex-col gap-1" aria-label="Accès rapides">
                <LienAccesRapide href="/admin/gabarit">Gabarit</LienAccesRapide>
                <LienAccesRapide href="/admin/jetons">Jetons QR</LienAccesRapide>
                <LienAccesRapide href="/admin/mapping">Rôles</LienAccesRapide>
              </nav>
            </Carte>
          </div>
        </div>
      </div>
    </Coquille>
  )
}

function CarteStatistique({
  libelle,
  valeur,
  accent = false,
}: {
  libelle: string
  valeur: number
  accent?: boolean
}) {
  return (
    <Carte className="flex flex-col gap-1 p-4">
      <p className={`text-2xl font-bold ${accent ? 'text-accent-doux' : 'text-texte-fort'}`}>
        {valeur}
      </p>
      <p className="text-xs text-texte-attenue">{libelle}</p>
    </Carte>
  )
}

function CarteAcces({
  titre,
  href,
  compteur,
  unite,
}: {
  titre: string
  href: string
  compteur: number
  unite: string
}) {
  const label = `${compteur} ${unite}${compteur > 1 ? 's' : ''}`
  return (
    <Link href={href} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-fond rounded-2xl">
      <Carte
        interactive
        className="flex items-center justify-between p-4"
      >
        <p className="text-sm font-semibold text-texte-fort">{titre}</p>
        <p className="text-xs text-texte-attenue">{label}</p>
      </Carte>
    </Link>
  )
}

function LienAccesRapide({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-9 items-center rounded-lg px-2 text-sm text-texte-attenue transition hover:bg-surface-forte hover:text-texte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      {children} →
    </Link>
  )
}
