import { describe, it, expect } from 'vitest'
import {
  BaremeVitesseInvalideError,
  creerResultatVitesse,
  enregistrerResultat,
  formaterTempsVitesse,
  ResultatVitesseInvalideError,
  validerEchelonsBareme,
  type EchelonBareme,
} from './vitesse'

// Spec #10 « Saisie de la vitesse — juge » (R7–R11) ; forme du résultat de spec #1
// R31. Domaine pur : la saisie d'un juge porte sur un RÉSULTAT de vitesse à trois
// formes (temps en secondes / chute / non-présentation), unique par grimpeur et
// par rencontre ; une ressaisie remplace (correction). Aucune dépendance Supabase.

describe('Résultat de vitesse — trois formes (R7)', () => {
  it('accepte un temps chronométré en secondes (R8)', () => {
    // Étant donné un juge qui chronomètre un grimpeur en 8,123 s
    // Quand il enregistre ce temps
    // Alors le résultat est un temps portant la durée mesurée en secondes
    expect(creerResultatVitesse({ type: 'temps', secondes: 8.123 })).toEqual({
      type: 'temps',
      secondes: 8.123,
    })
  })

  it('accepte une chute (R7)', () => {
    expect(creerResultatVitesse({ type: 'chute' })).toEqual({ type: 'chute' })
  })

  it('accepte une non-présentation (R7)', () => {
    expect(creerResultatVitesse({ type: 'non_presentation' })).toEqual({
      type: 'non_presentation',
    })
  })

  it('refuse une forme inconnue — exactement trois formes possibles (R7)', () => {
    // « top » n'est pas une issue de vitesse (c'est une épreuve de voie/bloc, spec #1 R30)
    expect(() =>
      creerResultatVitesse({ type: 'top' } as never),
    ).toThrow(ResultatVitesseInvalideError)
  })

  it('refuse un temps qui n’est pas une durée strictement positive (R8)', () => {
    // Un « temps chronométré » est une durée réellement mesurée : > 0.
    expect(() =>
      creerResultatVitesse({ type: 'temps', secondes: 0 }),
    ).toThrow(ResultatVitesseInvalideError)
    expect(() =>
      creerResultatVitesse({ type: 'temps', secondes: -5 }),
    ).toThrow(ResultatVitesseInvalideError)
    expect(() =>
      creerResultatVitesse({ type: 'temps', secondes: Number.NaN }),
    ).toThrow(ResultatVitesseInvalideError)
  })
})

describe('Unicité et correction du résultat par grimpeur (R10/R11)', () => {
  it('enregistre un premier résultat pour un grimpeur (R10)', () => {
    // Étant donné aucune saisie
    const saisies = new Map()
    // Quand le juge saisit le résultat du grimpeur g1
    const apres = enregistrerResultat(saisies, 'g1', { type: 'chute' })
    // Alors le résultat est enregistré, sans muter la saisie d'origine
    expect(apres.get('g1')).toEqual({ type: 'chute' })
    expect(saisies.size).toBe(0)
  })

  it('remplace le résultat d’un grimpeur déjà saisi — correction (R11)', () => {
    // Étant donné un grimpeur d'abord noté en chute
    const saisies = enregistrerResultat(new Map(), 'g1', { type: 'chute' })
    // Quand le juge corrige en un temps valide sur le même grimpeur
    const apres = enregistrerResultat(saisies, 'g1', { type: 'temps', secondes: 8.45 })
    // Alors l'unique résultat passe à ce temps (remplacement, pas de doublon — R10)
    expect(apres.get('g1')).toEqual({ type: 'temps', secondes: 8.45 })
    expect(apres.size).toBe(1)
  })

  it('refuse une saisie sans grimpeur sélectionné (R7)', () => {
    expect(() =>
      enregistrerResultat(new Map(), '', { type: 'chute' }),
    ).toThrow(ResultatVitesseInvalideError)
  })
})

describe('Formatage du temps (R13)', () => {
  it('formate un temps en secondes au millième', () => {
    expect(formaterTempsVitesse(8.123)).toBe('8,123 s')
    expect(formaterTempsVitesse(8.4)).toBe('8,400 s')
  })
})

// Spec #3 « Écrans de paramétrage » R47/R48 : validation d'un jeu d'échelons du
// barème de vitesse avant enregistrement (gabarit ou rencontre). Fonction pure —
// rejet global (throw) avec message précis dès qu'une condition a–f de R48 est
// violée ; en cas de succès, renvoie les échelons TRIÉS par rang_min croissant.
// L'invariant est celui de R46 : contigu, sans chevauchement, couvrant depuis le
// rang 1, un unique dernier échelon ouvert (rang_max nul).

/** Construit un échelon de test (points/décrément par défaut valides). */
const ech = (
  rangMin: number,
  rangMax: number | null,
  points = 1,
  decrement = 0,
): EchelonBareme => ({ rangMin, rangMax, points, decrement })

describe('Validation d’un jeu d’échelons de barème (R47/R48)', () => {
  it('accepte le barème enfant nominal et le renvoie trié (R48)', () => {
    // Étant donné le barème enfant (§ Matin) donné en désordre
    const desordre = [ech(11, null, 9), ech(1, 5, 15, 1), ech(6, 10, 10)]
    // Quand on le valide
    const valide = validerEchelonsBareme(desordre)
    // Alors il est accepté et renvoyé trié par rang_min croissant (R48.d/e)
    expect(valide.map((e) => [e.rangMin, e.rangMax])).toEqual([
      [1, 5],
      [6, 10],
      [11, null],
    ])
  })

  it('accepte un barème réduit à un seul échelon ouvert (R48.a/f)', () => {
    // Le minimum viable : un unique échelon « 1 et au-delà »
    expect(() => validerEchelonsBareme([ech(1, null, 10)])).not.toThrow()
  })

  it('refuse un jeu vide — au moins un échelon (R48.a)', () => {
    expect(() => validerEchelonsBareme([])).toThrow(BaremeVitesseInvalideError)
  })

  it('refuse un rang_min < 1 (R48.b)', () => {
    expect(() => validerEchelonsBareme([ech(0, null, 10)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse un rang_min non entier (R48.b)', () => {
    expect(() => validerEchelonsBareme([ech(1.5, null, 10)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse un rang_max borné inférieur à rang_min (R48.b)', () => {
    // rang_max = 3 < rang_min = 5 : plage incohérente
    expect(() => validerEchelonsBareme([ech(1, 4), ech(5, 3), ech(5, null)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse un rang_max non entier (R48.b)', () => {
    expect(() => validerEchelonsBareme([ech(1, 5.5), ech(6, null)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse des points négatifs (R48.c)', () => {
    expect(() => validerEchelonsBareme([ech(1, null, -1)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse un décrément négatif (R48.c)', () => {
    expect(() => validerEchelonsBareme([ech(1, null, 10, -1)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse des points non entiers (R48.c)', () => {
    expect(() => validerEchelonsBareme([ech(1, null, 2.5)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse une couverture qui ne commence pas au rang 1 (R48.d)', () => {
    // Le premier échelon trié commence à 2 → le rang 1 n'est pas couvert
    expect(() => validerEchelonsBareme([ech(2, 5), ech(6, null)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse un trou entre deux échelons (R48.e)', () => {
    // 1–5 puis 7–∞ : le rang 6 n'est couvert par aucun échelon
    expect(() => validerEchelonsBareme([ech(1, 5), ech(7, null)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse un chevauchement entre deux échelons (R48.e)', () => {
    // 1–5 et 4–∞ se recouvrent sur les rangs 4 et 5
    expect(() => validerEchelonsBareme([ech(1, 5), ech(4, null)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse un échelon non-dernier laissé ouvert (R48.e/f)', () => {
    // Un échelon ouvert (rang_max nul) au milieu : seul le dernier peut l'être
    expect(() => validerEchelonsBareme([ech(1, null), ech(6, null)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })

  it('refuse un dernier échelon borné — aucun échelon ouvert (R48.f)', () => {
    // 1–5 puis 6–10 bornés : les rangs au-delà de 10 ne sont pas couverts
    expect(() => validerEchelonsBareme([ech(1, 5), ech(6, 10)])).toThrow(
      BaremeVitesseInvalideError,
    )
  })
})
