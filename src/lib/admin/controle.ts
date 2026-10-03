import 'server-only'

import {
  libelleIssueBloc,
  libelleIssueVoie,
  modeControle,
  nomCourtAuteur,
  trierLignes,
  type LigneControle,
} from '@/domaine/controle'
import { type Categorie, type Phase } from '@/domaine/rencontre'
import { type IssueBloc, type IssueVoie } from '@/domaine/resultat'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

// Assemblage de l'écran de CONTRÔLE des résultats contre les fiches de juges
// (spec #16) : par voie de difficulté puis par bloc (R4), une ligne par résultat
// existant, tous clubs (R6), triée nom/prénom (R7), issue sans points (R8), coche
// + auteur (R11). Lecture sous session ADMIN : la branche `est_admin()` des RLS
// ouvre tous les clubs. Le client `service_role` ne sert qu'à résoudre l'email
// des auteurs de coche (`auth.admin`, ADR 0002).

/** Support contrôlé : une voie de difficulté ou un bloc (R4). */
export type SupportControle = {
  /** Id de la voie ou du bloc. */
  id: string
  type: 'voie' | 'bloc'
  /** Niveau de la voie (`T3`) ou code du bloc (`B1`). */
  code: string
  /** Cotation de la voie ; `null` pour un bloc. */
  cotation: string | null
  /** Lignes triées nom/prénom (R7). */
  lignes: LigneControle[]
}

export type ControleRencontre = {
  id: string
  dateRencontre: string
  categorie: Categorie
  phase: Phase
  /** `controle` en ④, `lecture` en ⑤ (R2). */
  mode: 'controle' | 'lecture'
  /** Voies (ordre de la structure) puis blocs (R4). */
  supports: SupportControle[]
}

type LigneBrute = {
  id: string
  grimpeurId: string
  issueLibelle: string
  controleLe: string | null
  controlePar: string | null
}

/**
 * Charge le contrôle d'une rencontre. Renvoie `null` si la rencontre est
 * introuvable **ou** hors ④/⑤ (écran indisponible, R2). À appeler derrière la
 * garde admin.
 */
export async function getControleRencontre(
  rencontreId: string,
  { avecAuteurs = true }: { avecAuteurs?: boolean } = {},
): Promise<ControleRencontre | null> {
  const supabase = await createClient()

  const rencontre = verifierLecture(
    await supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase')
      .eq('id', rencontreId)
      .maybeSingle(),
    'de la rencontre',
  )
  if (!rencontre) return null
  const phase = rencontre.phase as Phase
  const mode = modeControle(phase)
  if (!mode) return null

  const epreuves = verifierLecture(
    await supabase
      .from('epreuve')
      .select('id, type')
      .eq('rencontre_id', rencontreId),
    'des épreuves',
  )
  const epreuveVoie = (epreuves ?? []).find((e) => e.type === 'voie')?.id as string | undefined
  const epreuveBloc = (epreuves ?? []).find((e) => e.type === 'bloc')?.id as string | undefined

  const vide = Promise.resolve({ data: [] as Record<string, unknown>[], error: null })
  const [voiesRes, blocsRes] = await Promise.all([
    epreuveVoie
      ? supabase
          .from('voie_difficulte')
          .select('id, niveau, cotation, ordre')
          .eq('epreuve_id', epreuveVoie)
          .order('ordre')
      : vide,
    epreuveBloc
      ? supabase.from('bloc').select('id, code, ordre').eq('epreuve_id', epreuveBloc).order('ordre')
      : vide,
  ])
  const voies = verifierLecture(voiesRes, 'des voies') ?? []
  const blocs = verifierLecture(blocsRes, 'des blocs') ?? []
  const voieIds = voies.map((v) => v.id as string)
  const blocIds = blocs.map((b) => b.id as string)

  const [rvRes, rbRes, paliersRes, composRes, equipesRes] = await Promise.all([
    voieIds.length
      ? supabase
          .from('resultat_voie')
          .select('id, voie_difficulte_id, grimpeur_id, issue, controle_le, controle_par')
          .in('voie_difficulte_id', voieIds)
      : vide,
    blocIds.length
      ? supabase
          .from('resultat_bloc')
          .select('id, bloc_id, grimpeur_id, issue, palier_id, controle_le, controle_par')
          .in('bloc_id', blocIds)
      : vide,
    blocIds.length
      ? supabase.from('bloc_palier').select('id, libelle').in('bloc_id', blocIds)
      : vide,
    supabase.from('composition').select('grimpeur_id, equipe_id').eq('rencontre_id', rencontreId),
    supabase.from('equipe').select('id, club_id').eq('rencontre_id', rencontreId),
  ])

  const libellePalier = new Map<string, string>()
  for (const p of verifierLecture(paliersRes, 'des paliers') ?? []) libellePalier.set(p.id as string, p.libelle as string)

  const parSupport = new Map<string, LigneBrute[]>()
  const ajouter = (supportId: string, l: LigneBrute) => {
    if (!parSupport.has(supportId)) parSupport.set(supportId, [])
    parSupport.get(supportId)!.push(l)
  }
  for (const r of verifierLecture(rvRes, 'des résultats de voie') ?? []) {
    ajouter(r.voie_difficulte_id as string, {
      id: r.id as string,
      grimpeurId: r.grimpeur_id as string,
      issueLibelle: libelleIssueVoie(r.issue as IssueVoie),
      controleLe: (r.controle_le as string | null) ?? null,
      controlePar: (r.controle_par as string | null) ?? null,
    })
  }
  for (const r of verifierLecture(rbRes, 'des résultats de bloc') ?? []) {
    const palierId = (r.palier_id as string | null) ?? null
    ajouter(r.bloc_id as string, {
      id: r.id as string,
      grimpeurId: r.grimpeur_id as string,
      issueLibelle: libelleIssueBloc(
        r.issue as IssueBloc,
        palierId ? (libellePalier.get(palierId) ?? null) : null,
      ),
      controleLe: (r.controle_le as string | null) ?? null,
      controlePar: (r.controle_par as string | null) ?? null,
    })
  }

  // Grimpeurs concernés + club d'accueil (équipe de la composition, R6).
  const toutes = [...parSupport.values()].flat()
  const grimpeurIds = [...new Set(toutes.map((l) => l.grimpeurId))]
  const clubDeLEquipe = new Map<string, string>()
  for (const e of verifierLecture(equipesRes, 'des équipes') ?? []) clubDeLEquipe.set(e.id as string, e.club_id as string)
  const clubEquipe = new Map<string, string>()
  for (const c of verifierLecture(composRes, 'des compositions') ?? []) {
    const clubId = clubDeLEquipe.get(c.equipe_id as string)
    if (clubId) clubEquipe.set(c.grimpeur_id as string, clubId)
  }
  const { data: grimpeurs } = grimpeurIds.length
    ? await supabase.from('grimpeur').select('id, nom, prenom, club_id').in('id', grimpeurIds)
    : { data: [] as Record<string, unknown>[] }
  const infoGrimpeur = new Map<string, { nom: string; prenom: string; clubId: string }>()
  for (const g of grimpeurs ?? []) {
    infoGrimpeur.set(g.id as string, {
      nom: g.nom as string,
      prenom: g.prenom as string,
      clubId: g.club_id as string,
    })
  }
  const clubIds = [
    ...new Set([...infoGrimpeur.values()].map((g) => g.clubId).concat([...clubEquipe.values()])),
  ]
  const nomClub = new Map<string, string>()
  if (clubIds.length) {
    const clubs = verifierLecture(
      await supabase.from('club').select('id, nom').in('id', clubIds),
      'des clubs',
    )
    for (const c of clubs ?? []) nomClub.set(c.id as string, c.nom as string)
  }

  const auteurs = avecAuteurs
    ? await chargerAuteurs(toutes.map((l) => l.controlePar))
    : new Map<string, string>()

  const versLigne = (l: LigneBrute): LigneControle => {
    const g = infoGrimpeur.get(l.grimpeurId)
    const accueil = clubEquipe.get(l.grimpeurId)
    const prete = !!g && !!accueil && accueil !== g.clubId
    return {
      resultatId: l.id,
      nom: g?.nom ?? '(inconnu)',
      prenom: g?.prenom ?? '',
      clubNom: g ? (nomClub.get(g.clubId) ?? '(club inconnu)') : '(club inconnu)',
      clubAccueilNom: prete ? (nomClub.get(accueil!) ?? '(autre club)') : null,
      issueLibelle: l.issueLibelle,
      controleLe: l.controleLe,
      controlePar: l.controlePar ? (auteurs.get(l.controlePar) ?? null) : null,
    }
  }

  const supports: SupportControle[] = [
    ...voies.map((v) => ({
      id: v.id as string,
      type: 'voie' as const,
      code: v.niveau as string,
      cotation: v.cotation as string,
      lignes: trierLignes((parSupport.get(v.id as string) ?? []).map(versLigne)),
    })),
    ...blocs.map((b) => ({
      id: b.id as string,
      type: 'bloc' as const,
      code: b.code as string,
      cotation: null,
      lignes: trierLignes((parSupport.get(b.id as string) ?? []).map(versLigne)),
    })),
  ]

  return {
    id: rencontre.id as string,
    dateRencontre: rencontre.date_rencontre as string,
    categorie: rencontre.categorie as Categorie,
    phase,
    mode,
    supports,
  }
}

/**
 * Résout le nom court (R11) des admins auteurs de coche via `auth.admin` — les
 * comptes n'ont pas de nom, seul l'email est connu. Peu d'auteurs distincts.
 */
async function chargerAuteurs(ids: (string | null)[]): Promise<Map<string, string>> {
  const distincts = [...new Set(ids.filter((id): id is string => !!id))]
  const noms = new Map<string, string>()
  if (!distincts.length) return noms
  const admin = createAdminClient()
  await Promise.all(
    distincts.map(async (id) => {
      const data = verifierLecture(await admin.auth.admin.getUserById(id), "de l'auteur")
      const nom = nomCourtAuteur(data.user?.email ?? null)
      if (nom) noms.set(id, nom)
    }),
  )
  return noms
}
