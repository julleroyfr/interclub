import 'server-only'

import {
  construireRapport,
  dateExecution,
  ligneLog,
  verifierSecret,
  type DonneesRapport,
} from '@/domaine/rapport'
import { anneeSaison, bornesSaison } from '@/domaine/rencontre'
import { createAdminClient } from '@/lib/supabase/admin'
import { lireBornesAge } from '@/lib/rencontres/bornes-age'
import { compteEmbarque } from '@/lib/supabase/embarque'
import { verifierLecture } from '@/lib/supabase/lecture'
import { lireToutesLesPages } from '@/lib/supabase/pagination'

// Point d'accès du rapport périodique (spec #19), appelé tous les 3 jours par le
// cron de l'hébergeur. Écart justifié au « pas d'API custom » : un appel EXTERNE
// à l'API Supabase est ce qui maintient le projet gratuit actif (R2). Pas de
// session utilisateur : la garde est le secret du déclencheur (R4, R5), vérifié
// AVANT toute lecture — exception à l'ADR 0005 (R19).

/**
 * Lit, en une vague, les données de la saison courante (R8–R13). Les comptages
 * sont faits par la base : effectifs par club et année de naissance (RPC
 * `effectifs_grimpeurs`), équipes par rencontre (comptage embarqué).
 */
async function lireDonnees(saison: number): Promise<DonneesRapport> {
  const admin = createAdminClient()
  const { debut, fin } = bornesSaison(saison)
  const [clubs, effectifs, rencontres] = await Promise.all([
    admin.from('club').select('id, nom').then((r) => verifierLecture(r, 'des clubs') ?? []),
    // Une ligne par club et année de naissance : paginée par sûreté.
    lireToutesLesPages(
      (de, a) => admin.rpc('effectifs_grimpeurs').order('club_id').order('annee_naissance').range(de, a),
      'des effectifs',
    ),
    admin
      .from('rencontre')
      .select('id, date_rencontre, categorie, phase, club_porteur_id, equipe(count)')
      .gte('date_rencontre', debut)
      .lte('date_rencontre', fin)
      .then((r) => verifierLecture(r, 'des rencontres') ?? []),
  ])
  return {
    clubs,
    effectifs: effectifs as DonneesRapport['effectifs'],
    rencontres: rencontres.map(({ equipe, ...r }) => ({
      ...(r as Omit<DonneesRapport['rencontres'][number], 'nb_equipes'>),
      nb_equipes: compteEmbarque(equipe),
    })),
  }
}

function json(statut: number, corps: unknown): Response {
  return Response.json(corps, { status: statut, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Produit le rapport : garde du secret (R4, R5), lecture, logs (R14),
 * enregistrement (R15, R16). Un échec répond 500 sans rien enregistrer (R17).
 */
export async function reponseRapportPeriodique(requete: Request): Promise<Response> {
  const garde = verifierSecret(requete.headers.get('authorization'), process.env.CRON_SECRET)
  if (garde === 'non_configure') {
    console.error('[rapport-periodique] CRON_SECRET non configuré : appel refusé.')
    return json(500, { erreur: 'non_configure' })
  }
  if (garde === 'refuse') return json(401, { erreur: 'non_autorise' })

  try {
    const date = dateExecution(new Date())
    const donnees = await lireDonnees(anneeSaison(date))
    // Lus après les lectures : elles maintiennent le projet actif même si
    // AGE_BASCULE ou AGE_ADO_MAX manque (spec #19 R7bis).
    const rapport = construireRapport(donnees, date, lireBornesAge())
    console.log(ligneLog(rapport))

    const insertion = await createAdminClient()
      .from('rapport_periodique')
      .insert({ saison: rapport.saison, contenu: rapport })
    if (insertion.error) throw new Error(`Enregistrement du rapport impossible : ${insertion.error.message}`)

    return json(200, {
      saison: rapport.libelleSaison,
      clubs: rapport.nombreClubs,
      grimpeurs: rapport.totaux,
      rencontres: rapport.nombreRencontres,
    })
  } catch (erreur) {
    console.error('[rapport-periodique] échec :', erreur instanceof Error ? erreur.message : erreur)
    return json(500, { erreur: 'echec' })
  }
}
