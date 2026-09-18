import 'server-only'

import {
  GroupeDepartInvalideError,
  voiesDuGroupeDepart,
} from '@/domaine/engagement'
import { manquantsCloture } from '@/domaine/resultat'
import { createClient } from '@/lib/supabase/server'

// NP automatique à la clôture (spec #6 R18). Au passage ③ compétition → ④ clôture,
// tout ATTENDU sans résultat saisi reçoit l'issue « np » (non présenté, 0 point) :
//   - blocs (B1/B2) : pour chaque grimpeur engagé ;
//   - voies ENFANT : les 3 voies du groupe de départ (R9), une voie représentative
//     par niveau (plus petit `ordre`) ;
//   - voies ADO : AUCUNE ligne NP (voies choisies librement — décision 2026-09-08).
// Opération IDEMPOTENTE (n'écrase aucun résultat existant) exécutée par l'admin
// (est_admin() → écriture autorisée en clôture par la RLS). La dérivation des
// niveaux vient du domaine testé (`voiesDuGroupeDepart`, `manquantsCloture`).

/** Client Supabase du projet (schéma `interclub`). */
type Client = Awaited<ReturnType<typeof createClient>>

/**
 * Matérialise les résultats « NP » manquants pour une rencontre passée en clôture
 * (R18). À appeler après le passage en phase `cloture`. Idempotente.
 */
export async function materialiserNpCloture(
  supabase: Client,
  rencontreId: string,
): Promise<void> {
  const { data: renc } = await supabase
    .from('rencontre')
    .select('categorie')
    .eq('id', rencontreId)
    .maybeSingle()
  if (!renc) return
  const categorie = renc.categorie as 'enfant' | 'ado'

  const { data: epreuves } = await supabase
    .from('epreuve')
    .select('id, type')
    .eq('rencontre_id', rencontreId)
  const epreuveVoie = (epreuves ?? []).find((e) => e.type === 'voie')?.id as string | undefined
  const epreuveBloc = (epreuves ?? []).find((e) => e.type === 'bloc')?.id as string | undefined

  // Structure : voies (id, niveau, ordre) et blocs (id).
  const [voiesRes, blocsRes] = await Promise.all([
    epreuveVoie
      ? supabase.from('voie_difficulte').select('id, niveau, ordre').eq('epreuve_id', epreuveVoie)
      : Promise.resolve({ data: [] as { id: string; niveau: string; ordre: number }[] }),
    epreuveBloc
      ? supabase.from('bloc').select('id').eq('epreuve_id', epreuveBloc)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ])
  const voies = (voiesRes.data ?? []) as { id: string; niveau: string; ordre: number }[]
  const blocs = ((blocsRes.data ?? []) as { id: string }[]).map((b) => b.id)

  // Voie représentative par niveau (plus petit `ordre`) — pour poser le NP enfant.
  const voieParNiveau = new Map<string, { id: string; ordre: number }>()
  const niveauParVoie = new Map<string, string>()
  for (const v of voies) {
    niveauParVoie.set(v.id, v.niveau)
    const cur = voieParNiveau.get(v.niveau)
    if (!cur || v.ordre < cur.ordre) voieParNiveau.set(v.niveau, { id: v.id, ordre: v.ordre })
  }

  // Grimpeurs engagés (composition porte `rencontre_id` dénormalisé) + groupe.
  const { data: compos } = await supabase
    .from('composition')
    .select('grimpeur_id, groupe_depart')
    .eq('rencontre_id', rencontreId)
  if (!compos || compos.length === 0) return

  // Résultats déjà saisis.
  const grimpeurIds = [...new Set(compos.map((c) => c.grimpeur_id as string))]
  const [rvRes, rbRes] = await Promise.all([
    voies.length
      ? supabase
          .from('resultat_voie')
          .select('voie_difficulte_id, grimpeur_id')
          .in('voie_difficulte_id', voies.map((v) => v.id))
      : Promise.resolve({ data: [] as { voie_difficulte_id: string; grimpeur_id: string }[] }),
    blocs.length
      ? supabase
          .from('resultat_bloc')
          .select('bloc_id, grimpeur_id')
          .in('grimpeur_id', grimpeurIds)
      : Promise.resolve({ data: [] as { bloc_id: string; grimpeur_id: string }[] }),
  ])

  // Par grimpeur : niveaux de voie déjà saisis + blocs déjà saisis.
  const niveauxSaisis = new Map<string, Set<string>>()
  for (const r of (rvRes.data ?? []) as { voie_difficulte_id: string; grimpeur_id: string }[]) {
    const niv = niveauParVoie.get(r.voie_difficulte_id)
    if (!niv) continue
    const gid = r.grimpeur_id
    if (!niveauxSaisis.has(gid)) niveauxSaisis.set(gid, new Set())
    niveauxSaisis.get(gid)!.add(niv)
  }
  const blocsSaisis = new Map<string, Set<string>>()
  for (const r of (rbRes.data ?? []) as { bloc_id: string; grimpeur_id: string }[]) {
    const gid = r.grimpeur_id
    if (!blocsSaisis.has(gid)) blocsSaisis.set(gid, new Set())
    blocsSaisis.get(gid)!.add(r.bloc_id)
  }

  const npVoie: { voie_difficulte_id: string; grimpeur_id: string; issue: 'np' }[] = []
  const npBloc: { bloc_id: string; grimpeur_id: string; issue: 'np' }[] = []

  for (const c of compos) {
    const gid = c.grimpeur_id as string

    // Blocs (tous) : chaque bloc non saisi → NP.
    for (const blocId of manquantsCloture(blocs, [...(blocsSaisis.get(gid) ?? [])])) {
      npBloc.push({ bloc_id: blocId, grimpeur_id: gid, issue: 'np' })
    }

    // Voies enfant : les 3 niveaux du groupe de départ non saisis → NP (voie
    // représentative du niveau). Ado : rien (choix libre). Groupe absent
    // (« à définir ») : on ne peut pas dériver les attendus → on saute.
    if (categorie === 'enfant' && c.groupe_depart) {
      let niveaux: string[]
      try {
        niveaux = voiesDuGroupeDepart(c.groupe_depart as string)
      } catch (e) {
        if (e instanceof GroupeDepartInvalideError) continue
        throw e
      }
      for (const niv of manquantsCloture(niveaux, [...(niveauxSaisis.get(gid) ?? [])])) {
        const rep = voieParNiveau.get(niv)
        if (rep) npVoie.push({ voie_difficulte_id: rep.id, grimpeur_id: gid, issue: 'np' })
      }
    }
  }

  // Insert idempotent : ignore un éventuel doublon (relance de clôture).
  if (npVoie.length > 0) {
    await supabase
      .from('resultat_voie')
      .upsert(npVoie, { onConflict: 'voie_difficulte_id,grimpeur_id', ignoreDuplicates: true })
  }
  if (npBloc.length > 0) {
    await supabase
      .from('resultat_bloc')
      .upsert(npBloc, { onConflict: 'bloc_id,grimpeur_id', ignoreDuplicates: true })
  }
}
