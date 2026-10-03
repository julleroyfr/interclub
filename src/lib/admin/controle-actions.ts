'use server'

import { revalidatePath } from 'next/cache'

import { peutCocher } from '@/domaine/controle'
import { type Phase } from '@/domaine/rencontre'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { verifierLecture } from '@/lib/supabase/lecture'
import { createClient } from '@/lib/supabase/server'

// Coche de CONTRÔLE d'un résultat contre la fiche du juge (spec #16). Revérifie
// côté serveur le rôle ADMIN et la phase ④ clôture (R13) ; l'écriture passe par
// la branche `est_admin()` des policies `resultat_*_update` (frontière ultime).
// Ne modifie QUE `controle_le` / `controle_par` — jamais l'issue, le palier ni
// l'auteur de saisie (spec #16, Contraintes de données).

export type EtatControle = { erreur?: string } | undefined

/** Pose (`coche = true`) ou retire la coche de contrôle d'un résultat (R10). */
export async function basculerControle(
  type: 'voie' | 'bloc',
  resultatId: string,
  coche: boolean,
): Promise<EtatControle> {
  const u = await getUtilisateurCourant()
  if (u?.role !== 'admin') return { erreur: 'Action réservée à un administrateur.' }
  // Arguments venus du client (Server Action joignable en POST direct) : on ne
  // se fie pas au typage TypeScript, absent à l'exécution.
  if ((type !== 'voie' && type !== 'bloc') || typeof coche !== 'boolean' || !resultatId) {
    return { erreur: 'Requête de contrôle invalide.' }
  }

  const supabase = await createClient()
  const table = type === 'voie' ? 'resultat_voie' : 'resultat_bloc'
  const colonneSupport = type === 'voie' ? 'voie_difficulte_id' : 'bloc_id'
  const tableSupport = type === 'voie' ? 'voie_difficulte' : 'bloc'

  // Phase de la rencontre du résultat : résultat → voie/bloc → épreuve → rencontre.
  const resultat = verifierLecture(
    await supabase
      .from(table)
      .select(colonneSupport)
      .eq('id', resultatId)
      .maybeSingle(),
    'du résultat',
  )
  const supportId = (resultat as Record<string, unknown> | null)?.[colonneSupport] as
    | string
    | undefined
  if (!supportId) return { erreur: 'Résultat introuvable.' }
  const support = verifierLecture(
    await supabase
      .from(tableSupport)
      .select('epreuve_id')
      .eq('id', supportId)
      .maybeSingle(),
    type === 'voie' ? 'de la voie' : 'du bloc',
  )
  const epreuve = support
    ? verifierLecture(
        await supabase
          .from('epreuve')
          .select('rencontre_id')
          .eq('id', support.epreuve_id as string)
          .maybeSingle(),
        "de l'épreuve",
      )
    : null
  const rencontreId = epreuve?.rencontre_id as string | undefined
  if (!rencontreId) return { erreur: 'Résultat introuvable.' }
  const rencontre = verifierLecture(
    await supabase
      .from('rencontre')
      .select('phase')
      .eq('id', rencontreId)
      .maybeSingle(),
    'de la rencontre',
  )
  if (!rencontre || !peutCocher(rencontre.phase as Phase)) {
    return {
      erreur:
        "Le contrôle n'est modifiable qu'en clôture (④) : la rencontre a changé de phase.",
    }
  }

  const { data: maj, error } = await supabase
    .from(table)
    .update(
      coche
        ? { controle_le: new Date().toISOString(), controle_par: u.id }
        : { controle_le: null, controle_par: null },
    )
    .eq('id', resultatId)
    .select('id')
  if (error || !maj?.length) {
    return { erreur: "La coche n'a pas pu être enregistrée. Réessayez." }
  }

  revalidatePath(`/admin/rencontres/${rencontreId}/controle`)
  revalidatePath(`/admin/rencontres/${rencontreId}`)
  return undefined
}
