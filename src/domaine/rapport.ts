// Domaine pur — rapport périodique (spec #19). Calcule, à partir des lignes
// lues en base, la photographie de la saison : clubs, grimpeurs par tranche
// d'âge, rencontres. Aucun accès Supabase ici : la lecture, les logs et
// l'enregistrement relèvent de `src/lib/rapport/`.

import { ageEnSaison, anneeSaison, bornesSaison, labelSaison, type Categorie } from './rencontre'

/** Tranche d'âge d'un grimpeur dans la saison (R7). */
export type TrancheAge = 'enfant' | 'pivot' | 'ado' | 'adulte'

/** Issue de la vérification du secret du déclencheur (R4, R5). */
export type VerificationSecret = 'ok' | 'refuse' | 'non_configure'

/** Lignes lues en base, nécessaires au rapport. */
export type DonneesRapport = {
  clubs: { id: string; nom: string }[]
  grimpeurs: { club_id: string; annee_naissance: number }[]
  rencontres: {
    id: string
    date_rencontre: string
    categorie: Categorie
    phase: string
    club_porteur_id: string
  }[]
  equipes: { rencontre_id: string }[]
}

/** Effectifs par tranche d'âge (R9, R10). */
export type Effectifs = { enfant: number; pivot: number; ado: number; adulte: number; total: number }

export type RapportPeriodique = {
  dateExecution: string
  saison: number
  libelleSaison: string
  nombreClubs: number
  clubs: ({ nom: string } & Effectifs)[]
  totaux: Effectifs
  rencontres: { date: string; clubPorteur: string; categorie: Categorie; phase: string; equipes: number }[]
  nombreRencontres: { enfant: number; ado: number; adulte: number; total: number }
}

const PREFIXE_BEARER = 'Bearer '

/**
 * Vérifie l'en-tête `Authorization` du déclencheur (R4). Un secret non configuré
 * refuse tout appel (R5). Comparaison à temps constant sur la longueur du secret.
 */
export function verifierSecret(enTete: string | null, secret: string | undefined): VerificationSecret {
  if (!secret) return 'non_configure'
  if (!enTete?.startsWith(PREFIXE_BEARER)) return 'refuse'
  const fourni = enTete.slice(PREFIXE_BEARER.length)
  let ecart = fourni.length ^ secret.length
  for (let i = 0; i < secret.length; i++) {
    ecart |= secret.charCodeAt(i) ^ fourni.charCodeAt(i)
  }
  return ecart === 0 ? 'ok' : 'refuse'
}

/** Tranche d'âge (R7) : enfant ≤ 12, pivot = 13, ado 14–19, adulte ≥ 20. */
export function trancheAge(anneeNaissance: number, saison: number): TrancheAge {
  const age = ageEnSaison(anneeNaissance, saison)
  if (age <= 12) return 'enfant'
  if (age === 13) return 'pivot'
  if (age <= 19) return 'ado'
  return 'adulte'
}

/** Date d'exécution (AAAA-MM-JJ) dans le fuseau Europe/Paris (Vocabulaire). */
export function dateExecution(maintenant: Date): string {
  // Le format `sv-SE` rend directement AAAA-MM-JJ.
  return maintenant.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
}

const CLE_TRANCHE: Record<TrancheAge, keyof Omit<Effectifs, 'total'>> = {
  enfant: 'enfant',
  pivot: 'pivot',
  ado: 'ado',
  adulte: 'adulte',
}

function effectifsVides(): Effectifs {
  return { enfant: 0, pivot: 0, ado: 0, adulte: 0, total: 0 }
}

const ORDRE_CATEGORIE: Record<Categorie, number> = { enfant: 0, ado: 1, adulte: 2 }

/** Construit le rapport de la saison contenant `dateExecutionISO` (R6–R13). */
export function construireRapport(donnees: DonneesRapport, dateExecutionISO: string): RapportPeriodique {
  const saison = anneeSaison(dateExecutionISO)

  // R9, R10 — effectifs par club et totaux.
  const parClub = new Map(donnees.clubs.map((c) => [c.id, effectifsVides()]))
  const totaux = effectifsVides()
  for (const g of donnees.grimpeurs) {
    const club = parClub.get(g.club_id)
    // Garantie par la clé étrangère ; ignorée sinon pour que total = Σ clubs (R10).
    if (!club) continue
    const cle = CLE_TRANCHE[trancheAge(g.annee_naissance, saison)]
    for (const e of [club, totaux]) {
      e[cle] += 1
      e.total += 1
    }
  }
  const clubs = donnees.clubs
    .map((c) => ({ nom: c.nom, ...parClub.get(c.id)! }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))

  // R11–R13 — rencontres de la saison.
  const { debut, fin } = bornesSaison(saison)
  const nomClub = new Map(donnees.clubs.map((c) => [c.id, c.nom]))
  const equipesParRencontre = new Map<string, number>()
  for (const e of donnees.equipes) {
    equipesParRencontre.set(e.rencontre_id, (equipesParRencontre.get(e.rencontre_id) ?? 0) + 1)
  }
  const rencontres = donnees.rencontres
    .filter((r) => r.date_rencontre >= debut && r.date_rencontre <= fin)
    .sort(
      (a, b) =>
        a.date_rencontre.localeCompare(b.date_rencontre) || ORDRE_CATEGORIE[a.categorie] - ORDRE_CATEGORIE[b.categorie],
    )
    .map((r) => ({
      date: r.date_rencontre,
      clubPorteur: nomClub.get(r.club_porteur_id) ?? '',
      categorie: r.categorie,
      phase: r.phase,
      equipes: equipesParRencontre.get(r.id) ?? 0,
    }))
  const compter = (categorie: Categorie) => rencontres.filter((r) => r.categorie === categorie).length

  return {
    dateExecution: dateExecutionISO,
    saison,
    libelleSaison: labelSaison(saison),
    nombreClubs: donnees.clubs.length,
    clubs,
    totaux,
    rencontres,
    nombreRencontres: {
      enfant: compter('enfant'),
      ado: compter('ado'),
      adulte: compter('adulte'),
      total: rencontres.length,
    },
  }
}

/** Ligne de log du rapport (R14) : préfixe puis contenu complet sur une ligne. */
export function ligneLog(rapport: RapportPeriodique): string {
  return `[rapport-periodique] ${JSON.stringify(rapport)}`
}
