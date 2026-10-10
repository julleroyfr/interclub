import { describe, expect, it } from 'vitest'

import { creerTraceur, decrireAppel, estTraceActive } from './trace'

// Lot 0 du plan « appels Supabase » (docs/revues/2026-10-09-plan-action-appels-supabase.md) :
// rendre observables le nombre d'appels et de VAGUES (appels lancés pendant que
// d'autres sont en vol) d'un chargement de page ou d'une action. Horloge, sortie
// et minuterie injectées : tests déterministes, sans réseau.

const URL_BASE = 'https://projet.supabase.co'

describe('Description d’un appel Supabase', () => {
  it('nomme la table d’une lecture PostgREST', () => {
    expect(decrireAppel(`${URL_BASE}/rest/v1/rencontre?select=id%2Cphase&id=eq.1`, 'GET')).toBe(
      'GET rencontre',
    )
  })

  it('nomme la fonction d’un appel RPC', () => {
    expect(decrireAppel(`${URL_BASE}/rest/v1/rpc/contexte_coach_temporaire`, 'POST')).toBe(
      'RPC contexte_coach_temporaire',
    )
  })

  it('distingue un comptage (HEAD) et une écriture', () => {
    expect(decrireAppel(`${URL_BASE}/rest/v1/grimpeur?select=id`, 'HEAD')).toBe('HEAD grimpeur')
    expect(decrireAppel(`${URL_BASE}/rest/v1/resultat_voie?on_conflict=x`, 'POST')).toBe(
      'POST resultat_voie',
    )
  })

  it('garde le chemin d’un appel Auth, sans la requête', () => {
    expect(decrireAppel(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=1000`, 'GET')).toBe(
      'AUTH GET /admin/users',
    )
  })

  it('garde l’URL brute pour tout autre service', () => {
    expect(decrireAppel(`${URL_BASE}/storage/v1/object/x`, 'GET')).toBe('GET /storage/v1/object/x')
  })
})

/** Traceur sur une horloge manuelle ; les lignes journalisées sont capturées. */
function banc() {
  let t = 0
  const lignes: string[] = []
  const minuteries: (() => void)[] = []
  const traceur = creerTraceur({
    maintenant: () => t,
    journaliser: (ligne) => lignes.push(ligne),
    planifier: (fn) => {
      minuteries.push(fn)
      return () => minuteries.splice(minuteries.indexOf(fn), 1)
    },
  })
  return {
    traceur,
    lignes,
    avancer: (ms: number) => (t += ms),
    /** Déclenche les minuteries en attente (fin de séquence). */
    expirer: () => minuteries.splice(0).forEach((fn) => fn()),
  }
}

describe('Comptage des vagues', () => {
  it('des appels lancés pendant que d’autres sont en vol forment une seule vague', () => {
    const { traceur, avancer } = banc()
    const a = traceur.debut('GET rencontre')
    const b = traceur.debut('GET epreuve')
    avancer(100)
    traceur.fin(a, 200)
    traceur.fin(b, 200)
    expect(a.vague).toBe(1)
    expect(b.vague).toBe(1)
  })

  it('un appel lancé après la fin de tous les précédents ouvre une nouvelle vague', () => {
    const { traceur, avancer } = banc()
    traceur.fin(traceur.debut('GET compte'), 200)
    avancer(5)
    const deux = traceur.debut('GET rencontre')
    traceur.fin(deux, 200)
    avancer(5)
    const trois = traceur.debut('GET epreuve')
    expect(deux.vague).toBe(2)
    expect(trois.vague).toBe(3)
    expect(trois.numero).toBe(3)
  })

  it('une pause plus longue que le seuil ouvre une nouvelle séquence (nouvelle requête)', () => {
    const { traceur, avancer } = banc()
    traceur.fin(traceur.debut('GET compte'), 200)
    avancer(2000)
    const suivant = traceur.debut('GET compte')
    expect(suivant.sequence).toBe(2)
    expect(suivant.vague).toBe(1)
    expect(suivant.numero).toBe(1)
  })
})

describe('Journal', () => {
  it('journalise chaque appel avec séquence, vague, décalage, durée et statut', () => {
    const { traceur, lignes, avancer } = banc()
    traceur.fin(traceur.debut('GET compte'), 200)
    avancer(10)
    const appel = traceur.debut('RPC classement')
    avancer(85)
    traceur.fin(appel, 200)
    expect(lignes).toEqual([
      '[supabase] #1 v1 a1 +0ms 0ms 200 GET compte',
      '[supabase] #1 v2 a2 +10ms 85ms 200 RPC classement',
    ])
  })

  it('signale un appel en échec réseau', () => {
    const { traceur, lignes } = banc()
    traceur.fin(traceur.debut('GET compte'), 'échec')
    expect(lignes).toEqual(['[supabase] #1 v1 a1 +0ms 0ms échec GET compte'])
  })

  it('résume la séquence quand plus rien n’est en vol au bout du délai', () => {
    const { traceur, lignes, avancer, expirer } = banc()
    traceur.fin(traceur.debut('GET compte'), 200)
    const a = traceur.debut('GET rencontre')
    const b = traceur.debut('GET epreuve')
    avancer(120)
    traceur.fin(a, 200)
    traceur.fin(b, 200)
    expirer()
    expect(lignes.at(-1)).toBe('[supabase] #1 terminée : 2 vagues, 3 appels, 120 ms')
  })

  it('ne résume pas tant qu’un appel est encore en vol', () => {
    const { traceur, lignes, expirer } = banc()
    traceur.fin(traceur.debut('GET compte'), 200)
    traceur.debut('GET rencontre')
    expirer()
    expect(lignes.some((l) => l.includes('terminée'))).toBe(false)
  })
})

describe('Activation', () => {
  it('n’est active qu’avec SUPABASE_TRACE=1, et jamais en production', () => {
    expect(estTraceActive({ SUPABASE_TRACE: '1', NODE_ENV: 'development' })).toBe(true)
    expect(estTraceActive({ NODE_ENV: 'development' })).toBe(false)
    expect(estTraceActive({ SUPABASE_TRACE: '0', NODE_ENV: 'development' })).toBe(false)
    expect(estTraceActive({ SUPABASE_TRACE: '1', NODE_ENV: 'production' })).toBe(false)
  })
})
