import 'server-only'

import { anneeSaison, bornesAnneeNaissance, type Categorie, type Phase } from '@/domaine/rencontre'
import { exigerLectureAdmin } from '@/lib/auth/garde-lecture'
import {
  assemblerEngagementClub,
  type EngagementRencontre,
  type GrimpeurLu,
} from '@/lib/coach/assemblage-engagement'
import { versGrimpeurLu } from '@/lib/coach/engagement'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifierLecture } from '@/lib/supabase/lecture'
import { lireToutesLesPages } from '@/lib/supabase/pagination'
import { createClient } from '@/lib/supabase/server'

// Engagement de TOUS les clubs d'une rencontre, pour l'écran admin (spec #1 R10).
// Lectures GROUPÉES (une requête par table pour tous les clubs, en parallèle) puis
// assemblage par club, identique à celui du coach (`assemblerEngagementClub`).
// Sous session admin, la RLS `est_admin()` ouvre tous les clubs ; le catalogue
// `club` est lu en service_role (ADR 0002/0003).

export type EngagementClub = {
  clubId: string
  clubNom: string
  engagement: EngagementRencontre
}

/** Charge l'engagement de chaque club pour la rencontre (équipes + roster). */
export async function chargerEngagementTousClubs(
  rencontreId: string,
): Promise<EngagementClub[]> {
  await exigerLectureAdmin('engagement de tous les clubs')
  const admin = createAdminClient()
  const supabase = await createClient()

  const [clubsRes, rencRes] = await Promise.all([
    admin.from('club').select('id, nom').order('nom'),
    supabase
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club_porteur_id')
      .eq('id', rencontreId)
      .maybeSingle(),
  ])
  const clubs = verifierLecture(clubsRes, 'des clubs') ?? []
  const rencontre = verifierLecture(rencRes, 'de la rencontre')
  if (!rencontre) return []

  const categorie = rencontre.categorie as Categorie
  const saison = anneeSaison(rencontre.date_rencontre as string)

  const [equipesRes, pretsRes, roster] = await Promise.all([
    supabase
      .from('equipe')
      .select(
        'id, nom, club_id, composition(grimpeur_id, groupe_depart, grimpeur:grimpeur_id(id, nom, prenom, club_id))',
      )
      .eq('rencontre_id', rencontreId)
      .order('nom'),
    supabase
      .from('pret')
      .select('club_accueil_id, grimpeur:grimpeur_id(id, nom, prenom, club_id, annee_naissance)')
      .eq('rencontre_id', rencontreId),
    lireRosterEligible(supabase, categorie, saison),
  ])
  const equipesLues = verifierLecture(equipesRes, 'des équipes') ?? []
  const pretsLus = verifierLecture(pretsRes, 'des prêts') ?? []

  const nomClub = new Map<string, string>(clubs.map((c) => [c.id as string, c.nom as string]))

  // Regroupements par club.
  type Equipe = Parameters<typeof assemblerEngagementClub>[0]['equipes'][number]
  const equipesParClub = new Map<string, Equipe[]>()
  const grimpeursCompo = new Map<string, Omit<GrimpeurLu, 'anneeNaissance'>>()
  for (const e of equipesLues) {
    const compo = (e.composition as Record<string, unknown>[] | null) ?? []
    const equipe: Equipe = {
      id: e.id as string,
      nom: e.nom as string,
      composition: compo.map((c) => {
        const g = premier(c.grimpeur)
        if (g) {
          grimpeursCompo.set(g.id as string, {
            id: g.id as string,
            nom: g.nom as string,
            prenom: g.prenom as string,
            clubId: g.club_id as string,
          })
        }
        return {
          grimpeurId: c.grimpeur_id as string,
          groupeDepart: (c.groupe_depart as string | null) ?? null,
        }
      }),
    }
    ajouter(equipesParClub, e.club_id as string, equipe)
  }

  const pretesParClub = new Map<string, GrimpeurLu[]>()
  for (const p of pretsLus) {
    const g = premier(p.grimpeur)
    if (g) ajouter(pretesParClub, p.club_accueil_id as string, versGrimpeurLu(g))
  }

  const rosterParClub = new Map<string, GrimpeurLu[]>()
  for (const g of roster) ajouter(rosterParClub, g.clubId, g)

  const donneesRencontre = {
    id: rencontre.id as string,
    dateRencontre: rencontre.date_rencontre as string,
    categorie,
    phase: rencontre.phase as Phase,
    clubPorteurId: rencontre.club_porteur_id as string,
  }

  return clubs.map((c) => {
    const clubId = c.id as string
    return {
      clubId,
      clubNom: c.nom as string,
      engagement: assemblerEngagementClub(
        {
          rencontre: donneesRencontre,
          nomClub,
          equipes: equipesParClub.get(clubId) ?? [],
          grimpeursCompo,
          rosterClub: rosterParClub.get(clubId) ?? [],
          pretes: pretesParClub.get(clubId) ?? [],
        },
        clubId,
      ),
    }
  })
}

/**
 * Grimpeurs éligibles à la catégorie (R34, tous clubs), triés par nom puis
 * prénom : la lecture ne ramène que la tranche d'âge, pas tout le fichier des
 * licenciés, et elle est paginée (plafond de lignes de l'API).
 */
async function lireRosterEligible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categorie: Categorie,
  saison: number,
): Promise<GrimpeurLu[]> {
  const { min, max } = bornesAnneeNaissance(categorie, saison)
  const lignes = await lireToutesLesPages((debut, fin) => {
    let q = supabase
      .from('grimpeur')
      .select('id, nom, prenom, club_id, annee_naissance')
      .gte('annee_naissance', min)
    if (max !== null) q = q.lte('annee_naissance', max)
    return q.order('nom').order('prenom').order('id').range(debut, fin)
  }, 'des grimpeurs')
  return lignes.map(versGrimpeurLu)
}

/** Relation embarquée : objet ou tableau selon l'inférence du client. */
function premier(v: unknown): Record<string, unknown> | null {
  const x = Array.isArray(v) ? v[0] : v
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null
}

function ajouter<T>(m: Map<string, T[]>, cle: string, v: T) {
  const l = m.get(cle)
  if (l) l.push(v)
  else m.set(cle, [v])
}
