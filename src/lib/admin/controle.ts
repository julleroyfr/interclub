import 'server-only'

import {
  libelleIssueBloc,
  libelleIssueVoie,
  modeControle,
  progressionDeComptes,
  type Progression,
  nomCourtAuteur,
  trierLignes,
  type LigneControle,
} from '@/domaine/controle'
import { type Categorie, type Phase } from '@/domaine/rencontre'
import { type IssueBloc, type IssueVoie } from '@/domaine/resultat'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import { lireRencontreAdmin } from '@/lib/rencontres/lectures-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifierLecture } from '@/lib/supabase/lecture'
import { lireToutesLesPages } from '@/lib/supabase/pagination'
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

/** Ligne brute d'une lecture PostgREST. */
type Ligne = Record<string, unknown>

/** Relation embarquée (objet, ou tableau selon l'inférence de PostgREST). */
function embarque(valeur: unknown): Ligne | null {
  return ((Array.isArray(valeur) ? valeur[0] : valeur) as Ligne | null | undefined) ?? null
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
): Promise<ControleRencontre | null> {
  await exigerLectureAdmin('contrôle des résultats')
  const supabase = await createClient()

  // UNE vague (lot 2 du plan « appels Supabase ») : chaque table est filtrée sur
  // la rencontre par jointure `!inner`, grimpeurs et clubs sont embarqués, et
  // les lectures qui peuvent dépasser le plafond de l'API (1000 lignes) sont
  // paginées — sinon des résultats manqueraient sans erreur (constat J2).
  type Reponse = { data: Ligne[] | null; error: { message: string; code?: string } | null }
  const pagine = (requete: (debut: number, fin: number) => unknown, quoi: string) =>
    lireToutesLesPages((debut, fin) => requete(debut, fin) as PromiseLike<Reponse>, quoi)
  /** Grimpeur embarqué : nom, prénom et club d'origine (R6). */
  const GRIMPEUR = 'grimpeur:grimpeur_id(nom, prenom, club_id, club:club_id(nom))'

  const [rencRes, voiesRes, blocsRes, paliersRes, compos, rvLignes, rbLignes] = await Promise.all([
    supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase')
      .eq('id', rencontreId)
      .maybeSingle(),
    supabase
      .from('voie_difficulte')
      .select('id, niveau, cotation, ordre, epreuve!inner(rencontre_id)')
      .eq('epreuve.rencontre_id', rencontreId)
      .order('ordre'),
    supabase
      .from('bloc')
      .select('id, code, ordre, epreuve!inner(rencontre_id)')
      .eq('epreuve.rencontre_id', rencontreId)
      .order('ordre'),
    supabase
      .from('bloc_palier')
      .select('id, libelle, bloc!inner(epreuve!inner(rencontre_id))')
      .eq('bloc.epreuve.rencontre_id', rencontreId),
    // Équipe d'accueil (club et son nom) de chaque grimpeur composé (R6).
    pagine(
      (debut, fin) =>
        supabase
          .from('composition')
          .select('grimpeur_id, equipe_id, equipe:equipe_id(club_id, club:club_id(nom))')
          .eq('rencontre_id', rencontreId)
          .order('equipe_id')
          .order('grimpeur_id')
          .range(debut, fin),
      'des compositions',
    ),
    pagine(
      (debut, fin) =>
        supabase
          .from('resultat_voie')
          .select(
            `id, voie_difficulte_id, grimpeur_id, issue, controle_le, controle_par, ${GRIMPEUR}, voie_difficulte!inner(epreuve!inner(rencontre_id))`,
          )
          .eq('voie_difficulte.epreuve.rencontre_id', rencontreId)
          .order('id')
          .range(debut, fin),
      'des résultats de voie',
    ),
    pagine(
      (debut, fin) =>
        supabase
          .from('resultat_bloc')
          .select(
            `id, bloc_id, grimpeur_id, issue, palier_id, controle_le, controle_par, ${GRIMPEUR}, bloc!inner(epreuve!inner(rencontre_id))`,
          )
          .eq('bloc.epreuve.rencontre_id', rencontreId)
          .order('id')
          .range(debut, fin),
      'des résultats de bloc',
    ),
  ])

  const rencontre = verifierLecture(rencRes, 'de la rencontre')
  if (!rencontre) return null
  const phase = rencontre.phase as Phase
  const mode = modeControle(phase)
  if (!mode) return null

  const voies = verifierLecture(voiesRes, 'des voies') ?? []
  const blocs = verifierLecture(blocsRes, 'des blocs') ?? []
  const libellePalier = new Map<string, string>()
  for (const p of verifierLecture(paliersRes, 'des paliers') ?? []) libellePalier.set(p.id as string, p.libelle as string)

  // Grimpeurs (embarqués dans les résultats) et noms de clubs.
  const nomClub = new Map<string, string>()
  const infoGrimpeur = new Map<string, { nom: string; prenom: string; clubId: string }>()
  const retenirGrimpeur = (r: Ligne) => {
    const g = embarque(r.grimpeur)
    if (!g) return
    const clubId = g.club_id as string
    const nom = embarque(g.club)?.nom
    if (typeof nom === 'string') nomClub.set(clubId, nom)
    infoGrimpeur.set(r.grimpeur_id as string, {
      nom: g.nom as string,
      prenom: g.prenom as string,
      clubId,
    })
  }

  const parSupport = new Map<string, LigneBrute[]>()
  const ajouter = (supportId: string, l: LigneBrute) => {
    if (!parSupport.has(supportId)) parSupport.set(supportId, [])
    parSupport.get(supportId)!.push(l)
  }
  for (const r of rvLignes) {
    retenirGrimpeur(r)
    ajouter(r.voie_difficulte_id as string, {
      id: r.id as string,
      grimpeurId: r.grimpeur_id as string,
      issueLibelle: libelleIssueVoie(r.issue as IssueVoie),
      controleLe: (r.controle_le as string | null) ?? null,
      controlePar: (r.controle_par as string | null) ?? null,
    })
  }
  for (const r of rbLignes) {
    retenirGrimpeur(r)
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

  // Club d'accueil (équipe de la composition, R6).
  const clubEquipe = new Map<string, string>()
  for (const c of compos) {
    const equipe = embarque(c.equipe)
    if (!equipe) continue
    const clubId = equipe.club_id as string
    const nom = embarque(equipe.club)?.nom
    if (typeof nom === 'string') nomClub.set(clubId, nom)
    clubEquipe.set(c.grimpeur_id as string, clubId)
  }

  // Auteurs des coches : une seule vague, quel que soit leur nombre (R11).
  const toutes = [...parSupport.values()].flat()
  const auteurs = await chargerAuteurs(toutes.map((l) => l.controlePar))

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

/** Progression du contrôle affichée sur le tableau de bord (R3). */
export type ProgressionControle = {
  /** `controle` en ④, `lecture` en ⑤ (R2). */
  mode: 'controle' | 'lecture'
  progression: Progression
}

/**
 * Progression du contrôle d'une rencontre pour le tableau de bord (R3), sans
 * lire les résultats : quatre COMPTAGES (total et contrôlés, voies et blocs),
 * lancés une fois la phase connue (lot 4 du plan « appels Supabase »).
 * Renvoie `null` si la rencontre est introuvable ou hors ④/⑤ (R2).
 */
export async function getProgressionControle(
  rencontreId: string,
): Promise<ProgressionControle | null> {
  await exigerLectureAdmin('progression du contrôle')
  const rencontre = await lireRencontreAdmin(rencontreId)
  if (!rencontre) return null
  const mode = modeControle(rencontre.phase as Phase)
  if (!mode) return null

  const supabase = await createClient()
  const compter = async (
    table: 'resultat_voie' | 'resultat_bloc',
    controlees: boolean,
  ): Promise<number> => {
    const [jointure, filtre] =
      table === 'resultat_voie'
        ? ['voie_difficulte!inner(epreuve!inner(rencontre_id))', 'voie_difficulte.epreuve.rencontre_id']
        : ['bloc!inner(epreuve!inner(rencontre_id))', 'bloc.epreuve.rencontre_id']
    const requete = supabase
      .from(table)
      .select(`id, ${jointure}`, { count: 'exact', head: true })
      .eq(filtre, rencontreId)
    const reponse = await (controlees ? requete.not('controle_le', 'is', null) : requete)
    verifierLecture(reponse, 'du comptage des résultats')
    return reponse.count ?? 0
  }
  const [totalVoie, controleesVoie, totalBloc, controleesBloc] = await Promise.all([
    compter('resultat_voie', false),
    compter('resultat_voie', true),
    compter('resultat_bloc', false),
    compter('resultat_bloc', true),
  ])
  return {
    mode,
    progression: progressionDeComptes([
      { controlees: controleesVoie, total: totalVoie },
      { controlees: controleesBloc, total: totalBloc },
    ]),
  }
}

/**
 * Résout le nom court (R11) des admins auteurs de coche via `auth.admin` — les
 * comptes n'ont pas de nom, seul l'email est connu. Peu d'auteurs distincts,
 * tous lus en parallèle (une vague). `listUsers` n'est pas utilisé : il liste
 * aussi les utilisateurs anonymes des sessions QR, jamais purgés, et finirait
 * par dépasser une page.
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
