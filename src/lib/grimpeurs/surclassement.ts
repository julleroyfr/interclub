import 'server-only'

import { type BornesAge, type Categorie, type Phase, anneeSaison, labelSaison } from '@/domaine/rencontre'
import {
  type EngagementAdo,
  type LigneSurclassement,
  estSurclassable,
  saisonsSurclassement,
  selectionnerRetraits,
  surclassementActif,
} from '@/domaine/surclassement'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

// Surclassements des grimpeurs d'une page de l'écran Grimpeurs (spec #21
// R18–R19) : historique, saisons où un accord est possible, et rencontres dont
// le grimpeur serait retiré par une révocation (confirmation, R15). Lecture
// sous session admin (RLS `est_admin()`), en UNE vague pour toute la page.

/** Rencontre quittée à la révocation, telle qu'annoncée dans la confirmation (R15). */
export type RetraitAnnonce = {
  rencontreId: string
  dateRencontre: string
  clubPorteurNom: string
  /** Nom de l'équipe, ou `null` pour un prêt sans équipe. */
  equipeNom: string | null
  nature: 'composition' | 'pret'
}

/** Surclassement actif d'une saison, avec les retraits qu'entraînerait sa révocation. */
export type SurclassementActifAffiche = {
  saison: number
  libelleSaison: string
  retraits: RetraitAnnonce[]
}

/** État de surclassement d'un grimpeur pour l'écran Grimpeurs. */
export type EtatSurclassementGrimpeur = {
  historique: (LigneSurclassement & { libelleSaison: string })[]
  actifs: SurclassementActifAffiche[]
  /** Saisons où l'admin peut accorder un surclassement (R2–R4). */
  saisonsAccordables: { saison: number; libelle: string }[]
}

/** Grimpeur de la page, tel que le chargeur en a besoin. */
type GrimpeurPage = { id: string; anneeNaissance: number }

type RetraitLu = EngagementAdo & RetraitAnnonce & { grimpeurId: string }

const PHASES_A_VENIR: Phase[] = ['pre_competition', 'preparation']

/**
 * Charge l'état de surclassement de chaque grimpeur de la page. `bornes` nul =
 * âges non configurés (spec #1 R34bis) : aucun accord n'est proposé.
 */
export async function chargerSurclassementsPage(
  grimpeurs: readonly GrimpeurPage[],
  aujourdhui: string,
  bornes: BornesAge | null,
): Promise<Map<string, EtatSurclassementGrimpeur>> {
  const etats = new Map<string, EtatSurclassementGrimpeur>()
  if (grimpeurs.length === 0) return etats
  const ids = grimpeurs.map((g) => g.id)
  const supabase = await createClient()

  // Engagements ado à venir (① / ②) : seuls candidats au retrait (R12).
  const [surclRes, composRes, pretsRes] = await Promise.all([
    supabase
      .from('surclassement')
      .select('grimpeur_id, saison, accorde_le, revoque_le')
      .in('grimpeur_id', ids)
      .order('accorde_le', { ascending: false }),
    supabase
      .from('composition')
      .select(
        'grimpeur_id, equipe:equipe_id(nom), rencontre:rencontre_id!inner(id, date_rencontre, categorie, phase, club:club_porteur_id(nom))',
      )
      .in('grimpeur_id', ids)
      .eq('rencontre.categorie', 'ado')
      .in('rencontre.phase', PHASES_A_VENIR),
    supabase
      .from('pret')
      .select(
        'grimpeur_id, rencontre:rencontre_id!inner(id, date_rencontre, categorie, phase, club:club_porteur_id(nom))',
      )
      .in('grimpeur_id', ids)
      .eq('rencontre.categorie', 'ado')
      .in('rencontre.phase', PHASES_A_VENIR),
  ])

  const lignes = verifierLecture(surclRes, 'des surclassements') ?? []
  const retraitsLus: RetraitLu[] = [
    ...(verifierLecture(composRes, 'des engagements ado') ?? []).map((c) =>
      versRetrait(c, 'composition', (premier(c.equipe)?.nom as string | undefined) ?? null),
    ),
    ...(verifierLecture(pretsRes, 'des prêts ado') ?? []).map((p) => versRetrait(p, 'pret', null)),
  ].filter((r): r is RetraitLu => r !== null)

  const saisons = saisonsSurclassement(aujourdhui)
  for (const g of grimpeurs) {
    const historique = lignes
      .filter((l) => l.grimpeur_id === g.id)
      .map((l) => ({
        saison: l.saison as number,
        accordeLe: l.accorde_le as string,
        revoqueLe: (l.revoque_le as string | null) ?? null,
        libelleSaison: labelSaison(l.saison as number),
      }))
    const actifs = saisons
      .filter((s) => surclassementActif(historique, s))
      .map((s) => ({
        saison: s,
        libelleSaison: labelSaison(s),
        // La RPC ne retire rien si le grimpeur est éligible ado par l'âge ; le
        // chargeur annonce les retraits d'un surclassé, par construction < B.
        retraits: selectionnerRetraits(
          retraitsLus.filter((r) => r.grimpeurId === g.id),
          s,
          false,
        ).sort((a, b) => a.dateRencontre.localeCompare(b.dateRencontre)),
      }))
    const saisonsAccordables = bornes
      ? saisons
          .filter((s) => estSurclassable(g.anneeNaissance, s, bornes) && !surclassementActif(historique, s))
          .map((s) => ({ saison: s, libelle: labelSaison(s) }))
      : []
    etats.set(g.id, { historique, actifs, saisonsAccordables })
  }
  return etats
}

function versRetrait(
  ligne: Record<string, unknown>,
  nature: 'composition' | 'pret',
  equipeNom: string | null,
): RetraitLu | null {
  const r = premier(ligne.rencontre)
  if (!r) return null
  const date = r.date_rencontre as string
  return {
    grimpeurId: ligne.grimpeur_id as string,
    rencontreId: r.id as string,
    dateRencontre: date,
    categorie: r.categorie as Categorie,
    phase: r.phase as Phase,
    saison: anneeSaison(date),
    clubPorteurNom: (premier(r.club)?.nom as string | undefined) ?? '(club inconnu)',
    equipeNom,
    nature,
  }
}

/** Relation embarquée : objet ou tableau selon l'inférence du client. */
function premier(v: unknown): Record<string, unknown> | null {
  const x = Array.isArray(v) ? v[0] : v
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null
}
