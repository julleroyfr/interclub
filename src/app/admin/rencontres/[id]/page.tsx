import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage } from '@/composants'
import { anneeSaison, CATEGORIES, labelSaison, type Categorie } from '@/domaine/rencontre'
import { ongletsDisponibles, resoudreOnglet, type Onglet } from '@/domaine/tableau-de-bord'
import { getProgressionControle } from '@/lib/admin/controle'
import { chargerEngagementTousClubs } from '@/lib/admin/engagement'
import { chargerEquipesAdultes } from '@/lib/admin/equipes-adultes'
import { liensAdmin } from '@/lib/admin/navigation'
import { chargerStatistiquesRencontre } from '@/lib/admin/statistiques'
import { exigerAdmin } from '@/lib/auth/session'
import { chargerPretsRencontre } from '@/lib/prets/prets'
import { getStructureRencontre } from '@/lib/rencontres/structure'

import { OngletsTableauDeBord, type DefinitionOnglet } from './onglets-tableau-de-bord'
import { PanneauEquipes } from './panneau-equipes'
import { PanneauEquipesAdultes } from './panneau-equipes-adultes'
import { PanneauPilotage } from './panneau-pilotage'
import { PanneauPrets } from './panneau-prets'
import { PanneauStatistiques } from './panneau-statistiques'
import { PanneauStructure } from './panneau-structure'

export const metadata: Metadata = {
  title: 'Tableau de bord d’une rencontre — Interclub',
}

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
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ onglet?: string | string[] }>
}) {
  // Écran réservé à l'admin (R40, spec #1 R12) : 404 pour les autres rôles.
  // La RLS reste la vraie frontière.
  await exigerAdmin()

  const { id } = await params
  // Lectures indépendantes : en parallèle (chaque aller-retour vers la base
  // compte, l'écran se recharge après chaque action du tableau de bord).
  const [structure, { grimpeurs, clubs, prets }, engagementClubs, equipesAdultes, controle, statistiques] = await Promise.all([
    getStructureRencontre(id),
    chargerPretsRencontre(id),
    chargerEngagementTousClubs(id),
    // Rencontre adulte : équipes sans club (spec #20 R10–R15) ; `null` sinon.
    chargerEquipesAdultes(id),
    // Contrôle des résultats (spec #16) : ④ contrôle, ⑤ lecture seule (R2/R3) —
    // seulement la progression (comptages), pas les résultats eux-mêmes.
    getProgressionControle(id),
    // Statistiques d'une rencontre enfant (R41e–R41j) ; `null` sinon.
    chargerStatistiquesRencontre(id),
  ])
  if (!structure) notFound()

  const estEnfant = engagementClubs[0]?.engagement.categorie === 'enfant'

  // Compteurs du tableau de bord (R41), portés par les onglets (R41k).
  const nbEquipes = equipesAdultes
    ? equipesAdultes.equipes.length
    : engagementClubs.reduce((n, c) => n + c.engagement.equipes.length, 0)
  const nbEpreuves =
    structure.epreuves.reduce((n, e) => n + e.voiesDifficulte.length + e.blocs.length, 0) +
    structure.voiesVitesse.length
  const nbPrets = prets.length

  const progressionControle = controle?.progression ?? null

  // Onglets (R41k) : Prêts absent en adulte, Statistiques seulement en enfant.
  const disponibles = ongletsDisponibles(structure.categorie)
  const initial = resoudreOnglet((await searchParams).onglet, structure.categorie)
  const enCompetitionOuApres = ['competition', 'cloture', 'resultats_publics'].includes(
    structure.phase,
  )

  const panneaux: Record<Onglet, Omit<DefinitionOnglet, 'id'>> = {
    vue: {
      libelle: 'Vue d’ensemble',
      panneau: (
        <div className="grid gap-3 sm:grid-cols-2">
          <LienAcces
            href={`/admin/jetons?rencontre=${id}`}
            icone="▦"
            titre="QR codes"
            detail={`${structure.categorie === 'adulte' ? 'Capitaines' : 'Coach temporaire'} & juges`}
          />
          {(structure.phase === 'competition' || structure.phase === 'cloture') && (
            <LienAcces
              href={`/admin/rencontres/${id}/resultats`}
              icone="🛡️"
              titre={`${structure.phase === 'cloture' ? 'Corriger' : 'Saisir'} les résultats (tous clubs)`}
              admin
            />
          )}
          {controle && progressionControle && (
            <LienAcces
              href={`/admin/rencontres/${id}/controle`}
              icone="✅"
              titre={
                controle.mode === 'controle'
                  ? 'Contrôler les résultats (fiches juges)'
                  : 'Voir le contrôle des résultats'
              }
              detail={`${progressionControle.controlees}/${progressionControle.total} lignes contrôlées`}
              admin
            />
          )}
          {/* Classement consultable dès la ③ (spec #12 R15, spec #7 R11) : vue
              admin dédiée, tous clubs — jamais l'espace coach (corrige B1). */}
          {enCompetitionOuApres && (
            <LienAcces
              href={`/admin/rencontres/${id}/classement`}
              icone="📊"
              titre="Voir le classement (tous clubs)"
            />
          )}
          {/* Écran de diffusion pour un second afficheur (spec #14), même
              gate de phase que le classement (visible dès la ③). */}
          {enCompetitionOuApres && (
            <LienAcces
              href={`/admin/rencontres/${id}/affichage`}
              icone="📺"
              titre="Écran d’affichage (second écran)"
            />
          )}
        </div>
      ),
    },
    structure: {
      libelle: 'Structure',
      compteur: nbEpreuves,
      panneau: <PanneauStructure structure={structure} />,
    },
    equipes: {
      libelle: 'Équipes',
      compteur: nbEquipes,
      panneau: equipesAdultes ? (
        <PanneauEquipesAdultes donnees={equipesAdultes} />
      ) : (
        <PanneauEquipes rencontreId={id} estEnfant={estEnfant} clubs={engagementClubs} />
      ),
    },
    prets: {
      libelle: 'Prêts',
      compteur: nbPrets,
      panneau: (
        <PanneauPrets rencontreId={id} grimpeurs={grimpeurs} clubs={clubs} prets={prets} />
      ),
    },
    statistiques: {
      libelle: 'Statistiques',
      panneau: statistiques && (
        <PanneauStatistiques
          donnees={statistiques}
          nbBlocs={structure.epreuves.reduce(
            (n, e) => n + (e.type === 'bloc' && e.active ? e.blocs.length : 0),
            0,
          )}
          avecVitesse={structure.voiesVitesse.length > 0}
        />
      ),
    },
  }

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre={`Rencontre ${structure.clubPorteurNom} du ${formaterDate(structure.dateRencontre)}`}
          sousTitre={`${labelCategorie(structure.categorie)} · club porteur ${structure.clubPorteurNom} · saison ${labelSaison(anneeSaison(structure.dateRencontre))}`}
        />

        <PanneauPilotage
          rencontreId={id}
          phase={structure.phase}
          dateRencontre={structure.dateRencontre}
        />

        <OngletsTableauDeBord
          initial={initial}
          onglets={disponibles.map((o) => ({ id: o, ...panneaux[o] }))}
        />
      </div>
    </Coquille>
  )
}

/** Accès de la Vue d'ensemble (R41k) vers un écran de la rencontre. */
function LienAcces({
  href,
  icone,
  titre,
  detail,
  admin = false,
}: {
  href: string
  icone: string
  titre: string
  detail?: string
  admin?: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-3 rounded-2xl border p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        admin
          ? 'border-admin/40 bg-admin/10 hover:bg-admin/20'
          : 'border-bordure bg-black/20 hover:bg-surface-forte'
      }`}
    >
      <span className="flex items-center gap-3">
        <span aria-hidden className="text-xl">
          {icone}
        </span>
        <span>
          <span className={`block text-sm font-semibold ${admin ? 'text-admin' : 'text-texte-fort'}`}>
            {titre}
          </span>
          {detail && <span className="block text-xs text-texte-doux">{detail}</span>}
        </span>
      </span>
      <span aria-hidden className={admin ? 'text-admin' : 'text-accent'}>
        →
      </span>
    </Link>
  )
}
