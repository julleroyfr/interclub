import 'server-only'

import {
  clubsEngagesExport,
  construireDocumentExport,
  nomFichierExport,
  peutExporter,
  type DemandeurExport,
} from '@/domaine/export-classement'
import type { Categorie, Phase } from '@/domaine/rencontre'
import { getContexteCoach, getUtilisateurCourant } from '@/lib/auth/session'
import { getClassementRencontre } from '@/lib/classement/classement'
import { createAdminClient } from '@/lib/supabase/admin'
import { nomEmbarque } from '@/lib/supabase/embarque'
import { verifierLecture } from '@/lib/supabase/lecture'

import { rendrePdf } from './rendu-pdf'

// Point d'accès serveur de l'export PDF des classements officiels (spec #15).
// Seul écart au « pas d'API custom » : Supabase ne produit pas de PDF. Le point
// d'accès est joignable par URL directe, donc rôle / club engagé / phase ⑤
// (R1–R5) sont revérifiés ICI, avant de produire quoi que ce soit — le bouton
// masqué n'est pas une protection. Le classement est lu EN PARALLÈLE de cette
// vérification (une vague de moins, lot 1 du plan « appels Supabase ») et n'est
// utilisé que si elle passe.

/** Demandeur côté espace admin : l'admin, sinon personne (R3/R5). */
export async function demandeurAdmin(): Promise<DemandeurExport> {
  const utilisateur = await getUtilisateurCourant()
  return utilisateur?.role === 'admin' ? { role: 'admin' } : { role: 'anonyme' }
}

/** Demandeur côté espace coach : permanent (avec son club) ou temporaire (R4/R5). */
export async function demandeurCoach(): Promise<DemandeurExport> {
  const contexte = await getContexteCoach()
  if (!contexte) return { role: 'anonyme' }
  return contexte.type === 'permanent'
    ? { role: 'coach_permanent', clubId: contexte.clubId }
    : { role: 'coach_temporaire' }
}

type EtatRencontre = { phase: Phase; clubPorteurNom: string; clubsEngages: string[] }

/**
 * Phase, club porteur et clubs engagés de la rencontre ; `null` si introuvable.
 * En adulte, les clubs engagés sont ceux des grimpeurs composés (spec #20 R32).
 * UNE requête (constat R5 du 2026-11-10) : équipes et compositions embarquées
 * dans la rencontre — lue à chaque rechargement du classement, temps réel compris.
 */
async function lireEtatRencontre(rencontreId: string): Promise<EtatRencontre | null> {
  const rencontre = verifierLecture(
    await createAdminClient()
      .from('rencontre')
      .select('phase, categorie, club:club_porteur_id (nom), equipe (club_id), composition (grimpeur:grimpeur_id (club_id))')
      .eq('id', rencontreId)
      .maybeSingle(),
    "de l'état de la rencontre",
  )
  if (!rencontre) return null

  const equipes = (rencontre.equipe as { club_id: string | null }[] | null) ?? []
  const compositions = (rencontre.composition as { grimpeur: unknown }[] | null) ?? []
  const clubsDesGrimpeurs = compositions.map((c) => {
    const g = c.grimpeur as { club_id: string | null } | { club_id: string | null }[] | null
    return (Array.isArray(g) ? g[0]?.club_id : g?.club_id) ?? null
  })

  return {
    phase: rencontre.phase as Phase,
    clubPorteurNom: nomEmbarque(rencontre.club) ?? '',
    clubsEngages: clubsEngagesExport(
      rencontre.categorie as Categorie,
      equipes.map((e) => e.club_id ?? null),
      clubsDesGrimpeurs,
    ),
  }
}

/** Vrai si l'action « Exporter en PDF » doit être proposée à ce demandeur (R7). */
export async function exportDisponible(rencontreId: string, demandeur: DemandeurExport): Promise<boolean> {
  const etat = await lireEtatRencontre(rencontreId)
  return etat != null && peutExporter(demandeur, etat)
}

const introuvable = () => new Response('Introuvable', { status: 404 })

/**
 * Réponse HTTP de l'export : le fichier PDF en téléchargement (R8/R9), ou 404
 * si la rencontre n'existe pas, n'est pas en ⑤ ou si le demandeur n'y a pas
 * droit (R1–R5).
 */
export async function reponseExportPdf(rencontreId: string, demandeur: DemandeurExport): Promise<Response> {
  // Un anonyme n'a jamais droit à l'export (R5) : rien n'est lu pour lui.
  const lectureClassement = demandeur.role === 'anonyme' ? null : getClassementRencontre(rencontreId)
  const etat = await lireEtatRencontre(rencontreId)
  if (!etat || !peutExporter(demandeur, etat)) {
    // Refusé : le classement lu en parallèle est ignoré, son issue aussi.
    lectureClassement?.catch(() => {})
    return introuvable()
  }

  const classement = await lectureClassement
  if (!classement) return introuvable()

  const document = construireDocumentExport(
    {
      dateRencontre: classement.dateRencontre,
      categorie: classement.categorie,
      clubPorteurNom: etat.clubPorteurNom,
      individuel: classement.individuel,
      equipes: classement.equipes,
      clubs: classement.clubs,
    },
    new Date(),
  )
  const octets = await rendrePdf(document)
  const nom = nomFichierExport(classement.dateRencontre, classement.categorie)

  return new Response(new Blob([octets as BlobPart], { type: 'application/pdf' }), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nom}"`,
      // Document nominatif produit à la demande : jamais mis en cache partagé.
      'Cache-Control': 'private, no-store',
    },
  })
}
