import 'server-only'

import { type Categorie, type Phase } from '@/domaine/rencontre'
import {
  getSaisieTousClubs,
  type BlocConfig,
  type GrimpeurSaisie,
  type VoieOption,
} from '@/lib/coach/resultats'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'

// Assemblage de la saisie des résultats pour l'ADMIN (spec #9) : TOUS les clubs
// engagés d'une rencontre, lus en une seule série de lectures par le loader
// partagé avec le coach (`getSaisieTousClubs` — sous session admin, la RLS
// `est_admin()` ouvre tous les clubs). Le nom des clubs est embarqué dans cette
// même lecture (P11 : plus de vague à part).

/** Grimpeurs engagés d'un club, pour la liste maître (R10). */
export type SaisieClub = {
  clubId: string
  clubNom: string
  grimpeurs: GrimpeurSaisie[]
}

/** Saisie admin d'une rencontre : structure + grimpeurs regroupés par club. */
export type SaisieAdminRencontre = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  /** Vrai en ③ compétition OU ④ clôture : l'admin peut écrire (R5). */
  ouverteSaisie: boolean
  voiesEpreuve: VoieOption[]
  blocsConfig: BlocConfig[]
  /** Faux si l'épreuve de bloc est désactivée (adulte, spec #20 R38). */
  blocActif: boolean
  clubs: SaisieClub[]
}

/**
 * Charge la saisie de tous les clubs d'une rencontre pour l'admin. Renvoie `null`
 * si la rencontre est introuvable. À appeler derrière la garde admin. Les clubs
 * sans grimpeur engagé sont omis.
 */
export async function getSaisieAdminRencontre(
  rencontreId: string,
): Promise<SaisieAdminRencontre | null> {
  await exigerLectureAdmin('saisie admin des résultats')

  const saisie = await getSaisieTousClubs(rencontreId)
  if (!saisie) return null

  const clubs: SaisieClub[] = [...saisie.grimpeursParClub.keys()]
    .map((clubId) => ({
      clubId,
      clubNom: saisie.nomsClubs.get(clubId) ?? '(club inconnu)',
      grimpeurs: saisie.grimpeursParClub.get(clubId) ?? [],
    }))
    .sort((a, b) => a.clubNom.localeCompare(b.clubNom, 'fr'))

  return {
    id: saisie.id,
    dateRencontre: saisie.dateRencontre,
    categorie: saisie.categorie,
    phase: saisie.phase,
    ouverteSaisie: saisie.phase === 'competition' || saisie.phase === 'cloture',
    voiesEpreuve: saisie.voiesEpreuve,
    blocsConfig: saisie.blocsConfig,
    blocActif: saisie.blocActif,
    clubs,
  }
}
