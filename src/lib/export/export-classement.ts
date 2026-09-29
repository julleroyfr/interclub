import 'server-only'

import {
  construireDocumentExport,
  nomFichierExport,
  peutExporter,
  type DemandeurExport,
} from '@/domaine/export-classement'
import type { Phase } from '@/domaine/rencontre'
import { getContexteCoach, getUtilisateurCourant } from '@/lib/auth/session'
import { getClassementRencontre } from '@/lib/classement/classement'
import { createAdminClient } from '@/lib/supabase/admin'

import { rendrePdf } from './rendu-pdf'

// Point d'accès serveur de l'export PDF des classements officiels (spec #15).
// Seul écart au « pas d'API custom » : Supabase ne produit pas de PDF. Le point
// d'accès est joignable par URL directe, donc rôle / club engagé / phase ⑤
// (R1–R5) sont revérifiés ICI, avant toute lecture du classement — le bouton
// masqué n'est pas une protection.

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

/** Phase, club porteur et clubs engagés de la rencontre ; `null` si introuvable. */
async function lireEtatRencontre(rencontreId: string): Promise<EtatRencontre | null> {
  const admin = createAdminClient()
  const [rencontreRes, equipesRes] = await Promise.all([
    admin
      .from('rencontre')
      .select('phase, club:club_porteur_id (nom)')
      .eq('id', rencontreId)
      .maybeSingle(),
    admin.from('equipe').select('club_id').eq('rencontre_id', rencontreId),
  ])
  if (rencontreRes.error) throw new Error(`Lecture de la rencontre impossible : ${rencontreRes.error.message}`)
  if (equipesRes.error) throw new Error(`Lecture des équipes impossible : ${equipesRes.error.message}`)
  if (!rencontreRes.data) return null

  const club = rencontreRes.data.club as { nom: string } | { nom: string }[] | null
  const clubPorteurNom = (Array.isArray(club) ? club[0]?.nom : club?.nom) ?? ''
  return {
    phase: rencontreRes.data.phase as Phase,
    clubPorteurNom,
    clubsEngages: [...new Set((equipesRes.data ?? []).map((e) => e.club_id as string))],
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
  const etat = await lireEtatRencontre(rencontreId)
  if (!etat || !peutExporter(demandeur, etat)) return introuvable()

  const classement = await getClassementRencontre(rencontreId)
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
