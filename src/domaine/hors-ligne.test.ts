import { describe, expect, it } from 'vitest'

import {
  abandonnerSaisie,
  ajouterSaisie,
  appliquerIssueEnvoi,
  clePerimetre,
  ecartHorloge,
  heureSaisie,
  retirerRejet,
  saisiesAEnvoyer,
  type FileSaisies,
  type SaisieLocale,
} from './hors-ligne'

// Spec #17 « Saisie hors ligne » — file d'attente locale (R12–R19, R26/R27) et
// heure de saisie corrigée (R6). Domaine pur, sans stockage ni réseau.

type Contenu = { valeur: string }

function saisie(id: string, cible: string, saisiLe: number, valeur = id): SaisieLocale<Contenu> {
  return { id, cible, saisiLe, contenu: { valeur }, etat: 'en_attente' }
}

const vide: FileSaisies<Contenu> = []

describe('spec #17 — Périmètre de file (R3/R4)', () => {
  it('coach : rôle, rencontre et club ; juge : rôle et rencontre', () => {
    expect(clePerimetre({ role: 'coach', rencontreId: 'r1', clubId: 'cA' })).toBe('coach:r1:cA')
    expect(clePerimetre({ role: 'juge', rencontreId: 'r1' })).toBe('juge:r1:')
  })

  it('deux clubs sur la même rencontre ont des files distinctes (R4)', () => {
    expect(clePerimetre({ role: 'coach', rencontreId: 'r1', clubId: 'cA' })).not.toBe(
      clePerimetre({ role: 'coach', rencontreId: 'r1', clubId: 'cB' }),
    )
  })
})

describe('spec #17 — File d’attente (R12/R14/R16)', () => {
  it('une saisie entre dans la file, en attente (R12)', () => {
    const f = ajouterSaisie(vide, saisie('s1', 'voie:g1:v1', 100))
    expect(f).toEqual([saisie('s1', 'voie:g1:v1', 100)])
  })

  it('une nouvelle saisie sur une cible en attente la remplace (R14)', () => {
    let f = ajouterSaisie(vide, saisie('s1', 'voie:g1:v1', 100, 'echec'))
    f = ajouterSaisie(f, saisie('s2', 'voie:g1:v1', 200, 'top'))
    expect(f.map((s) => s.contenu.valeur)).toEqual(['top'])
  })

  it('les autres cibles ne sont pas touchées (R14)', () => {
    let f = ajouterSaisie(vide, saisie('s1', 'voie:g1:v1', 100))
    f = ajouterSaisie(f, saisie('s2', 'bloc:g1:b1', 150))
    f = ajouterSaisie(f, saisie('s3', 'voie:g1:v1', 200))
    expect(f.map((s) => s.id).sort()).toEqual(['s2', 's3'])
  })

  it('une saisie rejetée sur la même cible reste dans la liste des rejets (R26)', () => {
    let f: FileSaisies<Contenu> = [{ ...saisie('s1', 'voie:g1:v1', 100), etat: 'rejetee', motif: 'm' }]
    f = ajouterSaisie(f, saisie('s2', 'voie:g1:v1', 200))
    expect(f.map((s) => [s.id, s.etat])).toEqual([
      ['s1', 'rejetee'],
      ['s2', 'en_attente'],
    ])
  })

  it('les saisies à envoyer suivent l’ordre chronologique de saisie, sans les rejetées (R16)', () => {
    const f: FileSaisies<Contenu> = [
      saisie('tard', 'c3', 300),
      { ...saisie('rej', 'c4', 50), etat: 'rejetee', motif: 'm' },
      saisie('tot', 'c1', 100),
      saisie('milieu', 'c2', 200),
    ]
    expect(saisiesAEnvoyer(f).map((s) => s.id)).toEqual(['tot', 'milieu', 'tard'])
  })
})

describe('spec #17 — Issue d’un envoi (R17/R18/R19)', () => {
  const f = [saisie('s1', 'c1', 100), saisie('s2', 'c2', 200)]

  it('acceptée : la saisie quitte la file', () => {
    expect(appliquerIssueEnvoi(f, 's1', { type: 'acceptee' }).map((s) => s.id)).toEqual(['s2'])
  })

  it('échec temporaire : la saisie reste en attente, inchangée', () => {
    expect(appliquerIssueEnvoi(f, 's1', { type: 'temporaire' })).toEqual(f)
  })

  it('session absente : la saisie reste en attente (R19)', () => {
    expect(appliquerIssueEnvoi(f, 's1', { type: 'session' })).toEqual(f)
  })

  it('refus définitif : la saisie passe rejetée avec son motif, plus renvoyée', () => {
    const g = appliquerIssueEnvoi(f, 's1', { type: 'definitif', motif: 'une saisie plus récente existe déjà' })
    expect(g[0]).toMatchObject({ id: 's1', etat: 'rejetee', motif: 'une saisie plus récente existe déjà' })
    expect(saisiesAEnvoyer(g).map((s) => s.id)).toEqual(['s2'])
  })

  it('une issue sur une saisie déjà remplacée (R14) est sans effet', () => {
    expect(appliquerIssueEnvoi(f, 'disparue', { type: 'acceptee' })).toEqual(f)
  })
})

describe('spec #17 — Abandon et retrait de la liste (R26/R27)', () => {
  const f: FileSaisies<Contenu> = [
    saisie('att', 'c1', 100),
    { ...saisie('rej', 'c2', 200), etat: 'rejetee', motif: 'm' },
  ]

  it('abandonner retire une saisie en attente, sans l’envoyer (R27)', () => {
    expect(abandonnerSaisie(f, 'att').map((s) => s.id)).toEqual(['rej'])
  })

  it('abandonner ne retire pas une saisie rejetée', () => {
    expect(abandonnerSaisie(f, 'rej')).toEqual(f)
  })

  it('retirer de la liste ne vaut que pour une saisie rejetée (R26)', () => {
    expect(retirerRejet(f, 'rej').map((s) => s.id)).toEqual(['att'])
    expect(retirerRejet(f, 'att')).toEqual(f)
  })
})

describe('spec #17 — Heure de saisie corrigée (R6)', () => {
  it('l’écart mesure l’avance du serveur sur l’appareil', () => {
    expect(ecartHorloge(10_000, 9_000)).toBe(1_000)
    expect(ecartHorloge(10_000, 13_600_000)).toBe(-13_590_000)
  })

  it('l’heure de saisie = horloge de l’appareil + écart', () => {
    // Appareil en avance d'une heure : l'écart la ramène à l'heure du serveur.
    const ecart = ecartHorloge(1_000_000, 1_000_000 + 3_600_000)
    expect(heureSaisie(1_000_000 + 3_600_000 + 500, ecart)).toBe(1_000_500)
  })
})
