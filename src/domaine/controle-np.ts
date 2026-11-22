// Contrôle des NP après la clôture et aperçu de la clôture (spec #3 R17bis,
// R41l–R41s). Fonctions pures : le chargeur lit les compositions, la structure
// (blocs, voies de difficulté) et les résultats ; un grimpeur prêté arrive déjà
// rattaché à son club d'accueil (club de son équipe). Une épreuve absente ou
// désactivée n'est pas transmise (blocs vides, `avecVitesse` faux).

import { ECHELLE_NIVEAUX, GROUPES_DEPART, voiesDuGroupeDepart } from './engagement'
import { type Categorie, type Phase } from './rencontre'

/** Grimpeur engagé, rattaché au club de son équipe. */
export type GrimpeurNp = {
  grimpeurId: string
  nom: string
  prenom: string
  clubId: string
  clubNom: string
  equipeNom: string
  groupeDepart: string | null
}

export type BlocNp = { id: string; code: string; ordre: number }

/** Voie de difficulté ; `libelle` est le libellé d'affichage (R50). */
export type VoieNp = { id: string; niveau: string; libelle: string; cotation: string; ordre: number }

export type ResultatVoieNp = { grimpeurId: string; voieId: string; issue: string }
export type ResultatBlocNp = { grimpeurId: string; blocId: string; issue: string; palier: string | null }
export type VitesseNp = {
  grimpeurId: string
  issue: 'temps' | 'chute' | 'non_presentation'
  temps: number | null
}

export type EntreeControleNp = {
  categorie: Categorie
  /** La rencontre comporte des voies de vitesse (épreuve active). */
  avecVitesse: boolean
  blocs: readonly BlocNp[]
  voies: readonly VoieNp[]
  grimpeurs: readonly GrimpeurNp[]
  resultatsVoie: readonly ResultatVoieNp[]
  resultatsBloc: readonly ResultatBlocNp[]
  vitesses: readonly VitesseNp[]
}

/** Plafond de voies ado et adulte (spec #6 R11, spec #20 R22). */
export const VOIES_MAX_LIBRES = 6

// ─── R17bis — confirmation de la clôture ───────────────────────────────────

/** Seul le passage ③ → ④ demande une confirmation (R17bis a, e). */
export function transitionAConfirmer(courante: Phase, cible: Phase): boolean {
  return courante === 'competition' && cible === 'cloture'
}

export type Manques = { voies: number; blocs: number; vitessesNonSaisies: number }

const groupeValide = (groupe: string | null): groupe is string =>
  groupe !== null && (GROUPES_DEPART as readonly string[]).includes(groupe)

const parGrimpeur = <T extends { grimpeurId: string }>(lignes: readonly T[]) => {
  const m = new Map<string, T[]>()
  for (const l of lignes) {
    const liste = m.get(l.grimpeurId)
    if (liste) liste.push(l)
    else m.set(l.grimpeurId, [l])
  }
  return (id: string) => m.get(id) ?? []
}

const comparerFr = (a: string, b: string) => a.localeCompare(b, 'fr')

/**
 * Aperçu des manques à la clôture, par club et au total (R17bis c) : NP de voie
 * à poser (enfant : niveaux du groupe sans résultat et ayant une voie, spec #6
 * R18) ou voies manquantes `6 − n` (ado/adulte) ; NP de bloc à poser ; vitesses
 * non saisies. Les clubs sans manque sont exclus.
 */
export function apercuCloture(entree: EntreeControleNp) {
  const voiesDe = parGrimpeur(entree.resultatsVoie)
  const blocsDe = parGrimpeur(entree.resultatsBloc)
  const avecVitesse = new Set(entree.vitesses.map((v) => v.grimpeurId))
  const niveauDeVoie = new Map(entree.voies.map((v) => [v.id, v.niveau]))
  const niveauxAvecVoie = new Set(entree.voies.map((v) => v.niveau))

  const manquesDe = (g: GrimpeurNp): Manques => {
    const resultats = voiesDe(g.grimpeurId)
    let voies: number
    if (entree.categorie === 'enfant') {
      const niveauxSaisis = new Set(resultats.map((r) => niveauDeVoie.get(r.voieId)))
      voies = groupeValide(g.groupeDepart)
        ? voiesDuGroupeDepart(g.groupeDepart).filter((n) => niveauxAvecVoie.has(n) && !niveauxSaisis.has(n)).length
        : 0
    } else {
      voies = Math.max(0, VOIES_MAX_LIBRES - resultats.length)
    }
    const blocsSaisis = new Set(blocsDe(g.grimpeurId).map((r) => r.blocId))
    return {
      voies,
      blocs: entree.blocs.filter((b) => !blocsSaisis.has(b.id)).length,
      vitessesNonSaisies: entree.avecVitesse && !avecVitesse.has(g.grimpeurId) ? 1 : 0,
    }
  }

  const total: Manques = { voies: 0, blocs: 0, vitessesNonSaisies: 0 }
  const clubs = new Map<string, { clubId: string; clubNom: string } & Manques>()
  for (const g of entree.grimpeurs) {
    const m = manquesDe(g)
    const club = clubs.get(g.clubId) ?? { clubId: g.clubId, clubNom: g.clubNom, voies: 0, blocs: 0, vitessesNonSaisies: 0 }
    for (const k of ['voies', 'blocs', 'vitessesNonSaisies'] as const) {
      club[k] += m[k]
      total[k] += m[k]
    }
    clubs.set(g.clubId, club)
  }
  const parClub = [...clubs.values()]
    .filter((c) => c.voies + c.blocs + c.vitessesNonSaisies > 0)
    .sort((a, b) => comparerFr(a.clubNom, b.clubNom))
  return { total, parClub }
}

// ─── R41l–R41p — sections, fiche et signal ─────────────────────────────────

export type BlocFiche = { code: string; issue: string | null; palier: string | null }
export type VoieFiche = { niveau: string; libelle: string; cotation: string; issue: string }
export type VitesseFiche = {
  etat: 'temps' | 'chute' | 'np' | 'non_saisie' | 'sans_epreuve'
  temps: number | null
}

/** Fiche complète d'un grimpeur (R41o). `voies` n'est détaillé qu'en enfant. */
export type FicheNp = {
  blocs: BlocFiche[]
  voies: VoieFiche[]
  nbVoies: number
  vitesse: VitesseFiche
}

export type SignalNp = { texte: string; niveau: 'neutre' | 'alerte' | 'attention' }

export type LigneNp = {
  grimpeur: GrimpeurNp
  fiche: FicheNp
  signal: SignalNp | null
  /** Section Vitesse : non-présentation ou non saisie (R41n a). */
  vitesse?: 'np' | 'non_saisie'
}

export type SectionNp = {
  cle: string
  type: 'vitesse' | 'bloc' | 'niveau' | 'voies'
  titre: string
  attendus: number
  /** Niveau enfant : « libellé (cotation) » de ses voies (R41m). */
  voies: string[]
  lignes: LigneNp[]
}

/**
 * Signal d'une ligne (R41p) : le premier qui s'applique. « Tous les blocs » est
 * vrai sans bloc ; sans épreuve de vitesse, la condition de vitesse de a. est
 * vraie et b. ne s'applique jamais.
 */
export function signalNp(fiche: FicheNp, categorie: Categorie, avecVitesse: boolean): SignalNp | null {
  const tousBlocsNp = fiche.blocs.every((b) => b.issue === 'np')
  const aucunBlocNp = !fiche.blocs.some((b) => b.issue === 'np')
  const enfant = categorie === 'enfant'
  const voiesNp = fiche.voies.filter((v) => v.issue === 'np').length
  const aucuneVoieSaisie = enfant ? !fiche.voies.some((v) => v.issue !== 'np') : fiche.nbVoies === 0
  const toutesVoiesSaisies = enfant
    ? fiche.voies.length > 0 && voiesNp === 0
    : fiche.nbVoies >= VOIES_MAX_LIBRES
  const vitesseManquante = fiche.vitesse.etat === 'np' || fiche.vitesse.etat === 'non_saisie'

  if (tousBlocsNp && aucuneVoieSaisie && (vitesseManquante || !avecVitesse)) {
    return { texte: 'Tout NP : absent ?', niveau: 'neutre' }
  }
  if (avecVitesse && vitesseManquante && aucunBlocNp && toutesVoiesSaisies) {
    return { texte: 'Vitesse NP, fiche complète', niveau: 'alerte' }
  }
  if (fiche.vitesse.etat === 'temps' && tousBlocsNp && aucuneVoieSaisie) {
    return { texte: 'Rien saisi sauf vitesse', niveau: 'alerte' }
  }
  if (aucuneVoieSaisie) return { texte: 'Aucune voie saisie', niveau: 'alerte' }
  if (enfant && tousBlocsNp && voiesNp >= 2) return { texte: 'Peu de saisies', niveau: 'attention' }
  return null
}

const LIBELLE_ISSUE: Record<string, string> = {
  top: 'Top',
  top_moulinette: 'Top moulinette',
  prise_valorisee: 'Prise valorisée',
  zone1: 'Zone 1',
  zone2: 'Zone 2',
  echec: 'Échec',
  np: 'NP',
}

/** Temps de vitesse en secondes, deux décimales, virgule française (R41o c). */
export const formaterTemps = (temps: number) => `${temps.toFixed(2).replace('.', ',')} s`

/**
 * Textes de la fiche complète, dans l'ordre blocs, voies, vitesse (R41o) ; `np`
 * marque ce qui est mis en évidence (NP, non saisi, moins de 6 voies).
 */
export function elementsFiche(fiche: FicheNp, categorie: Categorie): { texte: string; np: boolean }[] {
  const blocs = fiche.blocs.map((b) => ({
    texte: `${b.code} ${
      b.issue === null ? 'non saisi' : b.issue === 'palier' ? `Palier ${b.palier ?? ''}`.trim() : (LIBELLE_ISSUE[b.issue] ?? b.issue)
    }`,
    np: b.issue === null || b.issue === 'np',
  }))
  const voies =
    categorie === 'enfant'
      ? fiche.voies.map((v) => ({ texte: `${v.niveau} ${LIBELLE_ISSUE[v.issue] ?? v.issue}`, np: v.issue === 'np' }))
      : [{ texte: `Voies ${fiche.nbVoies}/${VOIES_MAX_LIBRES}`, np: fiche.nbVoies < VOIES_MAX_LIBRES }]
  const v = fiche.vitesse
  const vitesse =
    v.etat === 'sans_epreuve'
      ? []
      : [
          v.etat === 'temps' && v.temps !== null
            ? { texte: `Vit ${formaterTemps(v.temps)}`, np: false }
            : v.etat === 'chute'
              ? { texte: 'Vit chute', np: false }
              : v.etat === 'np'
                ? { texte: 'Vit NP', np: true }
                : { texte: 'Vit non saisie', np: true },
        ]
  return [...blocs, ...voies, ...vitesse]
}

/** Libellé d'une issue de voie (R41o, R41s). */
export const libelleIssue = (issue: string) => LIBELLE_ISSUE[issue] ?? issue

const rangNiveau = (n: string) => (ECHELLE_NIVEAUX as readonly string[]).indexOf(n)

/** Sections du contrôle des NP (R41l–R41p) et leur nombre total de lignes. */
export function controleNp(entree: EntreeControleNp): { sections: SectionNp[]; nbLignes: number } {
  const enfant = entree.categorie === 'enfant'
  const voiesDe = parGrimpeur(entree.resultatsVoie)
  const blocsDe = parGrimpeur(entree.resultatsBloc)
  const vitesseDe = parGrimpeur(entree.vitesses)
  const voieParId = new Map(entree.voies.map((v) => [v.id, v]))
  const blocs = [...entree.blocs].sort((a, b) => a.ordre - b.ordre)

  const fiches = new Map<string, FicheNp>()
  for (const g of entree.grimpeurs) {
    const resultatsBloc = blocsDe(g.grimpeurId)
    const resultatsVoie = voiesDe(g.grimpeurId)
    const v = vitesseDe(g.grimpeurId)[0]
    fiches.set(g.grimpeurId, {
      blocs: blocs.map((b) => {
        const r = resultatsBloc.find((x) => x.blocId === b.id)
        return { code: b.code, issue: r?.issue ?? null, palier: r?.palier ?? null }
      }),
      voies: enfant
        ? resultatsVoie
            .flatMap((r) => {
              const voie = voieParId.get(r.voieId)
              return voie ? [{ voie, issue: r.issue }] : []
            })
            .sort((a, b) => rangNiveau(a.voie.niveau) - rangNiveau(b.voie.niveau) || a.voie.ordre - b.voie.ordre)
            .map(({ voie, issue }) => ({ niveau: voie.niveau, libelle: voie.libelle, cotation: voie.cotation, issue }))
        : [],
      nbVoies: resultatsVoie.length,
      vitesse: !entree.avecVitesse
        ? { etat: 'sans_epreuve', temps: null }
        : !v
          ? { etat: 'non_saisie', temps: null }
          : v.issue === 'non_presentation'
            ? { etat: 'np', temps: null }
            : { etat: v.issue, temps: v.temps },
    })
  }

  const trier = (a: GrimpeurNp, b: GrimpeurNp) =>
    comparerFr(a.clubNom, b.clubNom) || comparerFr(a.nom, b.nom) || comparerFr(a.prenom, b.prenom)
  const ligne = (g: GrimpeurNp, extra: Partial<LigneNp> = {}): LigneNp => {
    const fiche = fiches.get(g.grimpeurId)!
    return { grimpeur: g, fiche, signal: signalNp(fiche, entree.categorie, entree.avecVitesse), ...extra }
  }
  const grimpeursTries = [...entree.grimpeurs].sort(trier)
  const engages = entree.grimpeurs.length
  const sections: SectionNp[] = []

  if (entree.avecVitesse) {
    sections.push({
      cle: 'vitesse',
      type: 'vitesse',
      titre: 'Vitesse',
      attendus: engages,
      voies: [],
      lignes: grimpeursTries.flatMap((g) => {
        const etat = fiches.get(g.grimpeurId)!.vitesse.etat
        return etat === 'np' || etat === 'non_saisie' ? [ligne(g, { vitesse: etat })] : []
      }),
    })
  }

  for (const b of blocs) {
    sections.push({
      cle: `bloc-${b.id}`,
      type: 'bloc',
      titre: `Bloc ${b.code}`,
      attendus: engages,
      voies: [],
      lignes: grimpeursTries
        .filter((g) => blocsDe(g.grimpeurId).some((r) => r.blocId === b.id && r.issue === 'np'))
        .map((g) => ligne(g)),
    })
  }

  if (enfant) {
    for (const niveau of ECHELLE_NIVEAUX) {
      const voiesDuNiveau = entree.voies.filter((v) => v.niveau === niveau).sort((a, b) => a.ordre - b.ordre)
      const ids = new Set(voiesDuNiveau.map((v) => v.id))
      sections.push({
        cle: `niveau-${niveau}`,
        type: 'niveau',
        titre: `Niveau ${niveau}`,
        attendus: entree.grimpeurs.filter(
          (g) => groupeValide(g.groupeDepart) && voiesDuGroupeDepart(g.groupeDepart).includes(niveau),
        ).length,
        voies: voiesDuNiveau.map((v) => `${v.libelle} (${v.cotation})`),
        lignes: grimpeursTries
          .filter((g) => voiesDe(g.grimpeurId).some((r) => ids.has(r.voieId) && r.issue === 'np'))
          .map((g) => ligne(g)),
      })
    }
  } else {
    sections.push({
      cle: 'voies',
      type: 'voies',
      titre: `Moins de ${VOIES_MAX_LIBRES} voies`,
      attendus: engages,
      voies: [],
      lignes: grimpeursTries
        .filter((g) => voiesDe(g.grimpeurId).length < VOIES_MAX_LIBRES)
        .map((g) => ligne(g)),
    })
  }

  const visibles = sections.filter((s) => s.lignes.length > 0)
  return { sections: visibles, nbLignes: visibles.reduce((n, s) => n + s.lignes.length, 0) }
}

// ─── R41r, R41s — exports PDF ──────────────────────────────────────────────

/**
 * Lignes du PDF par club (R41s) : clubs ayant au moins une ligne, triés par nom ;
 * une ligne par grimpeur, triée par équipe puis nom, prénom.
 */
export function lignesNpParClub(controle: { sections: readonly SectionNp[] }) {
  const clubs = new Map<string, { clubId: string; clubNom: string; lignes: Map<string, LigneNp> }>()
  for (const s of controle.sections) {
    for (const l of s.lignes) {
      const c = clubs.get(l.grimpeur.clubId) ?? { clubId: l.grimpeur.clubId, clubNom: l.grimpeur.clubNom, lignes: new Map() }
      if (!c.lignes.has(l.grimpeur.grimpeurId)) c.lignes.set(l.grimpeur.grimpeurId, l)
      clubs.set(l.grimpeur.clubId, c)
    }
  }
  return [...clubs.values()]
    .sort((a, b) => comparerFr(a.clubNom, b.clubNom))
    .map((c) => ({
      clubId: c.clubId,
      clubNom: c.clubNom,
      lignes: [...c.lignes.values()].sort(
        (a, b) =>
          comparerFr(a.grimpeur.equipeNom, b.grimpeur.equipeNom) ||
          comparerFr(a.grimpeur.nom, b.grimpeur.nom) ||
          comparerFr(a.grimpeur.prenom, b.grimpeur.prenom),
      ),
    }))
}

/** Nom du fichier PDF : par niveau sans club, sinon par club (R41r, R41s). */
export function nomFichierNp(dateRencontre: string, clubNom?: string): string {
  if (clubNom === undefined) return `np-${dateRencontre}-par-niveau.pdf`
  const club = clubNom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `np-${dateRencontre}-${club}.pdf`
}
