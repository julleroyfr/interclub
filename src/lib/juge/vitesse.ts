import 'server-only'

import { type Sexe } from '@/domaine/grimpeur'
import { createClient } from '@/lib/supabase/server'

// Lecture du roster de saisie de la vitesse pour le juge (spec #10 R2/R12/R13).
// Le juge est ANONYME : il n'a aucun accès RLS direct à grimpeur/equipe/
// composition (réservés admin/coach). On passe donc par la RPC SECURITY DEFINER
// `liste_grimpeurs_vitesse(epreuve)`, restreinte au juge de la rencontre (ou
// admin), qui renvoie tous les compétiteurs engagés (tous clubs) avec leur
// résultat de vitesse courant. À appeler derrière la garde `getContexteJuge`.

/** Forme du résultat de vitesse d'un grimpeur ; `null` = à saisir (R13). */
export type IssueVitesse = 'temps' | 'chute' | 'non_presentation'

/** Ligne de saisie d'un compétiteur engagé pour la vitesse. */
export type GrimpeurVitesse = {
  grimpeurId: string
  nom: string
  prenom: string
  sexe: Sexe
  clubNom: string
  /** Résultat courant, ou `null` si aucun (à saisir). */
  issue: IssueVitesse | null
  /** Temps en secondes si `issue === 'temps'`, sinon `null` (R9). */
  temps: number | null
}

/** Données de saisie de la vitesse d'une rencontre pour le juge. */
export type SaisieVitesse = {
  epreuveVitesseId: string
  grimpeurs: GrimpeurVitesse[]
}

/**
 * Charge la liste des compétiteurs engagés + leur résultat de vitesse pour
 * l'épreuve donnée (R2). Renvoie une liste vide si l'appelant n'est pas le juge
 * de la rencontre (la RPC filtre côté serveur, fail-closed).
 */
export async function getSaisieVitesse(epreuveVitesseId: string): Promise<SaisieVitesse> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('liste_grimpeurs_vitesse', {
    p_epreuve: epreuveVitesseId,
  })
  if (error) {
    console.error('Lecture du roster de vitesse impossible :', error.message)
    return { epreuveVitesseId, grimpeurs: [] }
  }

  const lignes = (data ?? []) as Record<string, unknown>[]
  const grimpeurs: GrimpeurVitesse[] = lignes.map((l) => ({
    grimpeurId: l['grimpeur_id'] as string,
    nom: (l['nom'] as string) ?? '',
    prenom: (l['prenom'] as string) ?? '',
    sexe: (l['sexe'] as Sexe) ?? 'H',
    clubNom: (l['club_nom'] as string) ?? '',
    issue: (l['issue'] as IssueVitesse | null) ?? null,
    temps: l['temps'] != null ? Number(l['temps']) : null,
  }))

  return { epreuveVitesseId, grimpeurs }
}
