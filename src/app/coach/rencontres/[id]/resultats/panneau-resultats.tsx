'use client'

import Link from 'next/link'
import { createContext, type FormEvent, use, useMemo, useState } from 'react'

import { BandeauSynchro } from '@/composants/saisie-hors-ligne/BandeauSynchro'
import { ListeSaisies, type ResumeSaisie } from '@/composants/saisie-hors-ligne/ListeSaisies'
import { indicateurCible } from '@/composants/saisie-hors-ligne/etat-cible'
import { useFileSaisies } from '@/composants/saisie-hors-ligne/useFileSaisies'
import { useSuiviEnvoi } from '@/composants/saisie-hors-ligne/useSuiviEnvoi'
import type { IssueEnvoi } from '@/domaine/hors-ligne'
import { affichageVoiesBlocs, issuesVoieSaisissables, type IssueVoie } from '@/domaine/resultat'
import { formaterTempsVitesse } from '@/domaine/vitesse'
import { enregistrerSaisieCoach } from '@/lib/coach/resultats-actions'
import type {
  BlocConfig,
  GrimpeurSaisie,
  SaisieBloc,
  SaisieRencontre,
  SaisieVoie,
  VoieOption,
} from '@/lib/coach/resultats'
import type { ScoreGrimpeur } from '@/lib/resultats/reponse-enregistrement'
import {
  appliquerSaisieOptimiste,
  appliquerScore,
  cleSaisie,
  type SaisieOptimiste,
} from '@/lib/saisie/saisie-optimiste'

/** Délai d'affichage de la confirmation « enregistré » (spec #17 R23). */
const DUREE_CONFIRMATION_MS = 2500

/** Saisie conservée dans la file de l'appareil : la saisie + son résumé (R26/R27). */
type ContenuSaisie = { s: SaisieOptimiste; resume: ResumeSaisie }

/**
 * Envoi d'une saisie (spec #17) : elle entre dans la file de l'appareil, s'affiche
 * aussitôt « en attente » (R12/R22), puis est envoyée — y compris plus tard, sans
 * réseau au moment du clic (R15). La réponse la confirme (« enregistré ») ou la
 * rejette (retour à la valeur du serveur + motif, R18/R22).
 */
type Envoi = {
  /**
   * Gestionnaire `onSubmit` d'un formulaire de saisie : `construire` traduit les
   * champs (bouton cliqué compris) en saisie et en résumé lisible.
   */
  surSoumission: (construire: (fd: FormData) => ContenuSaisie) => (e: FormEvent<HTMLFormElement>) => void
  /** Motif de rejet par cible (clé `cleSaisie`), tant qu'aucune saisie plus récente n'a abouti. */
  rejets: Record<string, string>
  /** Cibles confirmées récemment par le serveur. */
  confirmes: Record<string, true>
}

const ContexteEnvoi = createContext<Envoi | null>(null)

function useEnvoi(): Envoi {
  const envoi = use(ContexteEnvoi)
  if (!envoi) throw new Error('useEnvoi hors du panneau de saisie')
  return envoi
}

/** Copie d'un dictionnaire sans la clé donnée. */
function sansCle<T>(dico: Record<string, T>, cle: string): Record<string, T> {
  const copie = { ...dico }
  delete copie[cle]
  return copie
}

/** Traduit la réponse de l'enregistrement en issue d'envoi (spec #17 R17–R20). */
async function envoyerSaisie(
  contenu: ContenuSaisie,
  saisiLe: string,
): Promise<{ issue: IssueEnvoi; heureServeur: number; donnees?: ScoreGrimpeur }> {
  const r = await enregistrerSaisieCoach(contenu.s, saisiLe)
  if (r.ok) return { issue: { type: 'acceptee' }, heureServeur: r.heureServeur, donnees: r.score }
  const issue: IssueEnvoi =
    r.refus.nature === 'definitif'
      ? { type: 'definitif', motif: r.refus.message }
      : { type: r.refus.nature }
  return { issue, heureServeur: r.heureServeur }
}

/**
 * État d'envoi d'une cible (R23, rév. 2026-10-09) : « en attente » et
 * « enregistré » seulement si l'enregistrement dure plus de 2 s ; « rejetée »
 * immédiat. Icône ET texte, pas seulement une couleur.
 */
function EtatEnvoi({
  cle,
  enAttente,
  suivi,
}: {
  cle: string
  enAttente?: boolean
  suivi: ReturnType<typeof useSuiviEnvoi>
}) {
  const { rejets, confirmes } = useEnvoi()
  const indicateur = indicateurCible({
    enAttente: !!enAttente,
    attenteLongue: suivi.attenteLongue,
    enregistreApresAttente: suivi.enregistreApresAttente,
    confirme: !!confirmes[cle],
    rejete: !!rejets[cle],
  })
  if (indicateur === 'attente') {
    return <span className="text-[10.5px] font-bold uppercase tracking-wide text-texte-attenue">⏳ En attente</span>
  }
  if (indicateur === 'rejet') {
    return <span className="text-[10.5px] font-bold uppercase tracking-wide text-danger">⚠ Rejetée</span>
  }
  if (indicateur === 'enregistre') {
    return <span className="text-[10.5px] font-bold uppercase tracking-wide text-secondaire">✓ Enregistré</span>
  }
  return null
}

/** Motif d'un rejet (R18), sous la cible concernée. */
function MotifRejet({ cle }: { cle: string }) {
  const { rejets } = useEnvoi()
  if (!rejets[cle]) return null
  return (
    <p role="alert" className="text-xs text-danger">
      {rejets[cle]}
    </p>
  )
}

/** Libellé lisible d'une issue de voie. */
const LIBELLE_ISSUE: Record<IssueVoie, string> = {
  top: 'Top',
  prise_valorisee: 'Prise valorisée',
  zone2: 'Zone 2',
  zone1: 'Zone 1',
  echec: 'Échec',
  np: 'NP',
}

/** Classe de pastille selon l'issue (top = vert, zone/prise = cyan, échec = rouge, NP = gris). */
function classeIssue(issue: IssueVoie | 'palier' | null): string {
  switch (issue) {
    case 'top':
    case 'palier':
      return 'bg-secondaire/15 text-secondaire border-secondaire/30'
    case 'prise_valorisee':
    case 'zone1':
    case 'zone2':
      return 'bg-accent/10 text-accent-doux border-accent/30'
    case 'echec':
      return 'bg-danger/10 text-danger border-danger/30'
    case 'np':
      return 'bg-white/5 text-texte-attenue border-bordure'
    default:
      return 'border-dashed border-bordure text-texte-doux'
  }
}

function trierAlpha(a: GrimpeurSaisie, b: GrimpeurSaisie): number {
  return a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom)
}

/** Libellé de l'état de vitesse (R22) : temps, chute, non-présentation, ou en attente. */
function libelleVitesse(vitesse: GrimpeurSaisie['vitesse']): string {
  switch (vitesse.statut) {
    case 'temps':
      return vitesse.temps != null ? formaterTempsVitesse(vitesse.temps) : 'temps'
    case 'chute':
      return 'Chute'
    case 'non_presentation':
      return 'Non-présentation'
    case 'en_attente':
      return 'en attente'
  }
}

/**
 * Panneau de saisie des résultats (spec #6). Deux vues des grimpeurs du club
 * engagés — par équipe / alphabétique (R24) — puis saisie par grimpeur avec
 * navigation précédent/suivant et balayage (R25). Vitesse et score en lecture
 * seule (R22/R23) : le score, restitué ici, agrège voie + bloc + vitesse (R23).
 */
export function PanneauResultats({
  saisie: saisieServeur,
  clubId,
  sessionQr,
  heureServeur,
}: {
  saisie: SaisieRencontre
  /** Club du coach : périmètre de la file d'attente (spec #17 R4). */
  clubId: string
  /** Coach temporaire (session QR) : à rescanner si la session manque (R25). */
  sessionQr: boolean
  /** Heure du serveur au rendu (ms) : écart d'horloge de l'appareil (R6). */
  heureServeur: number
}) {
  const [vue, setVue] = useState<'equipe' | 'alpha'>('equipe')
  const [selId, setSelId] = useState<string | null>(null)
  const [listeOuverte, setListeOuverte] = useState(false)
  // Saisies CONFIRMÉES par l'enregistrement, avec le score renvoyé (spec #6 R20,
  // rév. 2026-10-09) : l'écran n'est plus relu en entier après une saisie ; elles
  // restent affichées jusqu'à la prochaine lecture de l'écran (temps réel,
  // navigation), qui les contient alors.
  const [confirmees, setConfirmees] = useState<{ s: SaisieOptimiste; score: ScoreGrimpeur }[]>([])
  const [serveurVu, setServeurVu] = useState(saisieServeur)
  if (serveurVu !== saisieServeur) {
    setServeurVu(saisieServeur)
    setConfirmees([])
  }
  const [confirmes, setConfirmes] = useState<Record<string, true>>({})
  // Heure de la dernière saisie acceptée par cible : un rejet plus ancien n'est
  // plus signalé sur la cible (il reste dans la liste des rejets, R26).
  const [accepteeLe, setAccepteeLe] = useState<Record<string, number>>({})

  // File d'attente de l'appareil (spec #17 R12–R19, R28).
  const fileSaisies = useFileSaisies<ContenuSaisie, ScoreGrimpeur>({
    perimetre: { role: 'coach', rencontreId: saisieServeur.id, clubId },
    heureServeur,
    envoyer: (saisie, saisiLe) => envoyerSaisie(saisie.contenu, saisiLe),
    surAcceptee: (saisie, score) => {
      if (score) setConfirmees((c) => [...c, { s: saisie.contenu.s, score }])
      setAccepteeLe((a) => ({ ...a, [saisie.cible]: saisie.saisiLe }))
      setConfirmes((c) => ({ ...c, [saisie.cible]: true }))
      setTimeout(() => setConfirmes((c) => sansCle(c, saisie.cible)), DUREE_CONFIRMATION_MS)
    },
  })

  // Données du serveur + saisies confirmées + saisies en attente (spec #17 R22).
  const saisie = useMemo(() => {
    const confirme = confirmees.reduce(
      (acc, c) =>
        appliquerScore(
          appliquerSaisieOptimiste(acc, c.s, { enAttente: false }),
          c.s.grimpeurId,
          c.score,
        ),
      saisieServeur,
    )
    return fileSaisies.file
      .filter((e) => e.etat === 'en_attente')
      .sort((a, b) => a.saisiLe - b.saisiLe)
      .reduce((acc, e) => appliquerSaisieOptimiste(acc, e.contenu.s), confirme)
  }, [saisieServeur, confirmees, fileSaisies.file])

  const rejets = useMemo(() => {
    const r: Record<string, string> = {}
    for (const e of fileSaisies.file) {
      if (e.etat === 'rejetee' && e.motif && e.saisiLe > (accepteeLe[e.cible] ?? 0)) {
        r[e.cible] = e.motif
      }
    }
    return r
  }, [fileSaisies.file, accepteeLe])

  const surSoumission =
    (construire: (fd: FormData) => ContenuSaisie) => (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
      const contenu = construire(fd)
      fileSaisies.ajouter(cleSaisie(contenu.s), contenu)
    }

  const nbRejetees = fileSaisies.file.filter((e) => e.etat === 'rejetee').length

  // Ordre de parcours de la vue courante (support de la navigation ‹/›, R25).
  const ordreVue = useMemo(() => {
    const gs = [...saisie.grimpeurs]
    if (vue === 'alpha') return gs.sort(trierAlpha)
    return gs.sort(
      (a, b) => a.equipeNom.localeCompare(b.equipeNom) || trierAlpha(a, b),
    )
  }, [saisie.grimpeurs, vue])

  const selected = selId ? ordreVue.find((g) => g.grimpeurId === selId) ?? null : null

  if (saisie.grimpeurs.length === 0) {
    return (
      <p className="text-sm text-texte-attenue">
        Aucun grimpeur engagé pour votre club dans cette rencontre.
      </p>
    )
  }

  return (
    <ContexteEnvoi value={{ surSoumission, rejets, confirmes }}>
    <div className="flex flex-col gap-4 pb-20">
      <BandeauSynchro
        enLigne={fileSaisies.enLigne}
        nbEnAttente={fileSaisies.nbEnAttente}
        nbRejetees={nbRejetees}
        sessionAbsente={fileSaisies.sessionAbsente}
        actionSession={
          sessionQr ? (
            <span className="text-xs font-bold">Rescannez le QR code de votre club.</span>
          ) : (
            <Link href="/connexion" className="min-h-9 rounded-lg border border-current px-3 py-2 text-xs font-bold">
              Se reconnecter
            </Link>
          )
        }
        onVoirListe={() => setListeOuverte(true)}
      />
      {listeOuverte && (
        <ListeSaisies
          file={fileSaisies.file}
          onAbandonner={fileSaisies.abandonner}
          onRetirer={fileSaisies.retirerRejet}
          onFermer={() => setListeOuverte(false)}
        />
      )}
      {!saisie.ouverteSaisie && (
        <p className="rounded-xl border border-bordure bg-surface px-4 py-3 text-sm text-texte-attenue">
          La saisie des résultats n’est ouverte qu’en phase compétition. Les
          résultats restent consultables.
        </p>
      )}
      <p className="rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-xs text-accent-doux">
        Résultats visibles de tous au fil de l’eau — non officiels jusqu’à la
        publication. ⚡ Vitesse : saisie par le juge, lecture seule.
      </p>

      {selected ? (
        <DetailGrimpeur
          saisie={saisie}
          grimpeur={selected}
          ordreVue={ordreVue}
          onNaviguer={setSelId}
          onRetour={() => setSelId(null)}
        />
      ) : (
        <>
          <Onglets vue={vue} setVue={setVue} />
          <ListeGrimpeurs saisie={saisie} vue={vue} ordreVue={ordreVue} onChoisir={setSelId} />
        </>
      )}
    </div>
    </ContexteEnvoi>
  )
}

/** Bascule de vue (R24). */
function Onglets({
  vue,
  setVue,
}: {
  vue: 'equipe' | 'alpha'
  setVue: (v: 'equipe' | 'alpha') => void
}) {
  const base = 'flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition'
  const actif = 'border-accent bg-accent text-fond'
  const inactif = 'border-bordure bg-black/20 text-texte-attenue hover:bg-surface-forte'
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setVue('equipe')}
        className={`${base} ${vue === 'equipe' ? actif : inactif}`}
      >
        Par équipe
      </button>
      <button
        type="button"
        onClick={() => setVue('alpha')}
        className={`${base} ${vue === 'alpha' ? actif : inactif}`}
      >
        Alphabétique
      </button>
    </div>
  )
}

/** Compteurs de progression + état vitesse (R20/R22) ; sans compteurs avant la ③ (R21bis). */
function Chips({ saisie, grimpeur }: { saisie: SaisieRencontre; grimpeur: GrimpeurSaisie }) {
  const { progression: p, vitesse } = grimpeur
  const avantCompetition =
    affichageVoiesBlocs(saisie.phase, saisie.categorie, grimpeur.groupeDepart) === 'avant_competition'
  const chip = 'inline-flex items-center gap-1 rounded-full border border-bordure bg-black/20 px-2 py-0.5 text-[11px] font-bold text-texte-attenue'
  const ok = 'border-secondaire/30 text-secondaire'
  const voiesOk = p.voiesFaites >= p.voiesTotal
  const blocsOk = p.blocsFaites >= p.blocsTotal
  return (
    <span className="flex flex-wrap gap-1.5">
      {!avantCompetition && (
        <>
          <span className={`${chip} ${voiesOk ? ok : ''}`}>🧗 {p.voiesFaites}/{p.voiesTotal}</span>
          <span className={`${chip} ${blocsOk ? ok : ''}`}>🧱 {p.blocsFaites}/{p.blocsTotal}</span>
        </>
      )}
      <span
        className={`${chip} ${vitesse.statut === 'en_attente' ? 'border-dashed text-texte-doux' : 'border-accent/30 text-accent-doux'}`}
      >
        ⚡ {libelleVitesse(vitesse)}
      </span>
      <span className={`${chip} border-secondaire/30 text-secondaire`}>
        🏆 {grimpeur.score} pts
      </span>
    </span>
  )
}

/** Liste des grimpeurs, groupée par équipe ou à plat (A→Z) selon la vue (R24). */
function ListeGrimpeurs({
  saisie,
  vue,
  ordreVue,
  onChoisir,
}: {
  saisie: SaisieRencontre
  vue: 'equipe' | 'alpha'
  ordreVue: GrimpeurSaisie[]
  onChoisir: (id: string) => void
}) {
  if (vue === 'alpha') {
    return (
      <ul className="flex flex-col divide-y divide-white/5 rounded-2xl border border-bordure bg-surface">
        {ordreVue.map((g) => (
          <LigneGrimpeur key={g.grimpeurId} saisie={saisie} grimpeur={g} onChoisir={onChoisir} alpha />
        ))}
      </ul>
    )
  }
  // Groupé par équipe.
  const groupes = new Map<string, GrimpeurSaisie[]>()
  for (const g of ordreVue) {
    if (!groupes.has(g.equipeNom)) groupes.set(g.equipeNom, [])
    groupes.get(g.equipeNom)!.push(g)
  }
  return (
    <div className="flex flex-col gap-4">
      {[...groupes.entries()].map(([equipe, membres]) => (
        <div key={equipe}>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-accent">
            {equipe} <span className="font-medium normal-case text-texte-doux">· {membres.length}</span>
          </p>
          <ul className="flex flex-col divide-y divide-white/5 rounded-2xl border border-bordure bg-surface">
            {membres.map((g) => (
              <LigneGrimpeur key={g.grimpeurId} saisie={saisie} grimpeur={g} onChoisir={onChoisir} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function LigneGrimpeur({
  saisie,
  grimpeur,
  onChoisir,
  alpha,
}: {
  saisie: SaisieRencontre
  grimpeur: GrimpeurSaisie
  onChoisir: (id: string) => void
  alpha?: boolean
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoisir(grimpeur.grimpeurId)}
        className="flex w-full flex-col gap-2 px-3 py-3 text-left hover:bg-surface-forte"
      >
        <span className="flex items-center gap-2">
          <span className="font-semibold text-texte-fort">
            {alpha ? `${grimpeur.nom} ${grimpeur.prenom}` : `${grimpeur.prenom} ${grimpeur.nom}`}
          </span>
          {alpha && (
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent-doux">
              {grimpeur.equipeNom}
            </span>
          )}
          {grimpeur.prete && (
            <span className="rounded-full border border-prete/35 bg-prete/10 px-2 py-0.5 text-[10px] font-bold uppercase text-prete">
              Prêté
            </span>
          )}
          <span className="ml-auto text-texte-doux">›</span>
        </span>
        <Chips saisie={saisie} grimpeur={grimpeur} />
      </button>
    </li>
  )
}

/** Détail d'un grimpeur : navigation ‹/› + balayage (R25), saisie voies/blocs. */
function DetailGrimpeur({
  saisie,
  grimpeur,
  ordreVue,
  onNaviguer,
  onRetour,
}: {
  saisie: SaisieRencontre
  grimpeur: GrimpeurSaisie
  ordreVue: GrimpeurSaisie[]
  onNaviguer: (id: string) => void
  onRetour: () => void
}) {
  const index = ordreVue.findIndex((g) => g.grimpeurId === grimpeur.grimpeurId)
  const prev = index > 0 ? ordreVue[index - 1] : null
  const next = index < ordreVue.length - 1 ? ordreVue[index + 1] : null
  const [depart, setDepart] = useState<number | null>(null)
  // Avant la ③ : structure non lisible → message unique (R21bis).
  const affichage = affichageVoiesBlocs(saisie.phase, saisie.categorie, grimpeur.groupeDepart)

  function onTouchEnd(x: number) {
    if (depart == null) return
    const delta = x - depart
    if (delta < -50 && next) onNaviguer(next.grimpeurId)
    else if (delta > 50 && prev) onNaviguer(prev.grimpeurId)
    setDepart(null)
  }

  return (
    <div
      className="flex flex-col gap-4"
      onTouchStart={(e) => setDepart(e.changedTouches[0]?.clientX ?? null)}
      onTouchEnd={(e) => onTouchEnd(e.changedTouches[0]?.clientX ?? 0)}
    >
      <button type="button" onClick={onRetour} className="self-start text-sm text-texte-attenue">
        ← Liste des grimpeurs
      </button>

      <div className="flex items-center justify-between gap-2 rounded-xl border border-bordure bg-white/[0.03] px-3 py-2">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && onNaviguer(prev.grimpeurId)}
          className="rounded-lg border border-accent/30 bg-black/20 px-3 py-1.5 text-lg font-bold text-accent-doux disabled:border-bordure disabled:text-texte-doux"
          aria-label="Grimpeur précédent"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="font-bold text-texte-fort">
            {grimpeur.prenom} {grimpeur.nom}
          </div>
          <div className="text-[11px] text-texte-doux">
            {index + 1} / {ordreVue.length} · {grimpeur.equipeNom}
          </div>
        </div>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && onNaviguer(next.grimpeurId)}
          className="rounded-lg border border-accent/30 bg-black/20 px-3 py-1.5 text-lg font-bold text-accent-doux disabled:border-bordure disabled:text-texte-doux"
          aria-label="Grimpeur suivant"
        >
          ›
        </button>
      </div>
      <p className="-mt-2 text-center text-[11px] text-texte-doux">
        ← glissez pour changer de grimpeur →
      </p>

      {/* Score au fil de l'eau (voie + bloc + vitesse, R23) — calcul du domaine (spec #7). */}
      <div className="flex items-center justify-between rounded-xl border border-secondaire/25 bg-secondaire/5 px-3 py-2 text-sm">
        <span className="text-texte-attenue">Score (voie + bloc + vitesse)</span>
        <span className="font-extrabold text-secondaire">
          {grimpeur.score}
          <span className="ml-1 text-[11px] font-bold text-texte-doux">pts</span>
        </span>
      </div>

      {affichage === 'avant_competition' ? (
        <p className="rounded-2xl border border-dashed border-bordure bg-surface px-4 py-3 text-sm text-texte-attenue">
          Les voies et blocs seront visibles à l’ouverture de la compétition.
        </p>
      ) : (
        <>
          <SectionVoies saisie={saisie} grimpeur={grimpeur} />
          <SectionBlocs saisie={saisie} grimpeur={grimpeur} />
        </>
      )}
      <SectionVitesse grimpeur={grimpeur} />
    </div>
  )
}

/** Section « voies de difficulté » : enfant (3 attendues) ou ado (réalisées + ajout). */
function SectionVoies({ saisie, grimpeur }: { saisie: SaisieRencontre; grimpeur: GrimpeurSaisie }) {
  const estAdo = saisie.categorie === 'ado'
  const dejaSaisies = new Set(grimpeur.voies.map((v) => v.voieDifficulteId))
  const dispoAdo = saisie.voiesEpreuve.filter((v) => !dejaSaisies.has(v.voieDifficulteId))
  const peutAjouterAdo =
    estAdo && saisie.ouverteSaisie && grimpeur.voies.length < grimpeur.voiesTotal

  return (
    <div className="rounded-2xl border border-bordure bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-accent">Voie de difficulté</h3>
        <span className="text-[11px] font-bold text-texte-attenue">
          {grimpeur.progression.voiesFaites}/{grimpeur.voiesTotal}
        </span>
      </div>

      {affichageVoiesBlocs(saisie.phase, saisie.categorie, grimpeur.groupeDepart) ===
        'groupe_a_definir' && (
        <p className="text-xs italic text-texte-doux">
          Groupe de départ à définir dans l’engagement (les 3 voies en découlent).
        </p>
      )}

      <ul className="flex flex-col divide-y divide-white/5">
        {grimpeur.voies.map((v) => (
          <LigneVoie
            key={v.voieDifficulteId}
            saisie={saisie}
            grimpeur={grimpeur}
            voie={v}
            retirable={estAdo}
          />
        ))}
      </ul>

      {peutAjouterAdo && dispoAdo.length > 0 && (
        <FormAjoutVoieAdo saisie={saisie} grimpeur={grimpeur} disponibles={dispoAdo} />
      )}
    </div>
  )
}

/** Une voie : issue courante + boutons d'issue (si saisie ouverte), retrait ado. */
function LigneVoie({
  saisie,
  grimpeur,
  voie,
  retirable,
}: {
  saisie: SaisieRencontre
  grimpeur: GrimpeurSaisie
  voie: SaisieVoie
  retirable: boolean
}) {
  const { surSoumission } = useEnvoi()
  const issues = issuesVoieSaisissables(saisie.categorie, voie.typeVoie)
  const cible = { grimpeurId: grimpeur.grimpeurId, voieDifficulteId: voie.voieDifficulteId }
  const cle = cleSaisie({ type: 'voie', ...cible, issue: 'top' })
  const nomGrimpeur = `${grimpeur.prenom} ${grimpeur.nom}`
  const suivi = useSuiviEnvoi(!!voie.enAttente)

  return (
    <li className="flex flex-col gap-2 py-2" data-en-attente={voie.enAttente ? '' : undefined}>
      <div className="flex items-center gap-2">
        <span className="min-w-9 font-bold text-texte-fort">{voie.niveau}</span>
        <span className="text-[11px] text-texte-doux">{voie.cotation}</span>
        <span className="ml-auto flex items-center gap-2">
          <EtatEnvoi cle={cle} enAttente={voie.enAttente} suivi={suivi} />
          {voie.issue && (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${classeIssue(voie.issue)} ${
                voie.enAttente && suivi.attenteLongue ? 'border-dashed' : ''
              }`}
            >
              {LIBELLE_ISSUE[voie.issue]}
            </span>
          )}
        </span>
      </div>

      {saisie.ouverteSaisie && (
        <div className="flex flex-wrap items-center gap-1.5">
          <form
            onSubmit={surSoumission((fd) => {
              const issue = String(fd.get('issue')) as IssueVoie
              return {
                s: { type: 'voie', ...cible, issue },
                resume: { grimpeur: nomGrimpeur, cible: `Voie ${voie.niveau}`, valeur: LIBELLE_ISSUE[issue] },
              }
            })}
            className="flex flex-wrap gap-1.5"
          >
            <input type="hidden" name="rencontreId" value={saisie.id} />
            <input type="hidden" name="voieDifficulteId" value={voie.voieDifficulteId} />
            <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
            {issues.map((iss) => (
              <button
                key={iss}
                type="submit"
                name="issue"
                value={iss}
                className={`min-h-11 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50 ${
                  voie.issue === iss
                    ? classeIssue(iss)
                    : 'border-bordure bg-black/20 text-texte-attenue hover:bg-surface-forte'
                }`}
              >
                {LIBELLE_ISSUE[iss]}
              </button>
            ))}
          </form>
          {retirable && voie.issue && (
            <form
              onSubmit={surSoumission(() => ({
                s: { type: 'retrait_voie', ...cible },
                resume: { grimpeur: nomGrimpeur, cible: `Voie ${voie.niveau}`, valeur: 'Retrait' },
              }))}
            >
              <input type="hidden" name="rencontreId" value={saisie.id} />
              <input type="hidden" name="voieDifficulteId" value={voie.voieDifficulteId} />
              <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
              <button
                type="submit"
                aria-label={`Retirer la voie ${voie.niveau}`}
                className="min-h-11 min-w-11 rounded-lg border border-danger/40 px-2 py-1 text-sm text-danger hover:bg-danger/10"
              >
                ×
              </button>
            </form>
          )}
        </div>
      )}
      <MotifRejet cle={cle} />
    </li>
  )
}

/** Ajout d'une voie ado (choix libre parmi les voies non réalisées, R11). */
function FormAjoutVoieAdo({
  saisie,
  grimpeur,
  disponibles,
}: {
  saisie: SaisieRencontre
  grimpeur: GrimpeurSaisie
  disponibles: VoieOption[]
}) {
  const { surSoumission } = useEnvoi()
  // Ado : voies tête → issues Top / Zone 2 / Zone 1 / Échec.
  const issues = issuesVoieSaisissables('ado', 'tete')
  // La voie ajoutée s'affiche aussitôt dans la liste (en attente) ; un rejet
  // s'affiche ici, la voie disparaissant alors de la liste.
  const [derniereCle, setDerniereCle] = useState<string | null>(null)

  return (
    <form
      onSubmit={surSoumission((fd) => {
        const s: SaisieOptimiste = {
          type: 'voie',
          grimpeurId: grimpeur.grimpeurId,
          voieDifficulteId: String(fd.get('voieDifficulteId') ?? ''),
          issue: String(fd.get('issue')) as IssueVoie,
        }
        setDerniereCle(cleSaisie(s))
        const niveau = disponibles.find((v) => v.voieDifficulteId === s.voieDifficulteId)?.niveau ?? ''
        return {
          s,
          resume: {
            grimpeur: `${grimpeur.prenom} ${grimpeur.nom}`,
            cible: `Voie ${niveau}`,
            valeur: LIBELLE_ISSUE[s.issue],
          },
        }
      })}
      className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-bordure bg-accent/[0.03] p-3"
    >
      <input type="hidden" name="rencontreId" value={saisie.id} />
      <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
      <label className="text-[11px] font-bold uppercase tracking-wide text-accent">
        Ajouter une voie ({grimpeur.voies.length}/{grimpeur.voiesTotal})
        <select
          name="voieDifficulteId"
          required
          defaultValue=""
          className="mt-1 h-9 w-full rounded-lg border border-bordure bg-black/30 px-2 text-xs font-normal normal-case text-texte-fort [color-scheme:dark]"
        >
          <option value="" disabled className="bg-fond text-texte">
            — Choisir une voie —
          </option>
          {disponibles.map((v) => (
            <option key={v.voieDifficulteId} value={v.voieDifficulteId} className="bg-fond text-texte">
              {v.niveau} ({v.cotation})
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {issues.map((iss) => (
          <button
            key={iss}
            type="submit"
            name="issue"
            value={iss}
            className="min-h-11 rounded-lg border border-bordure bg-black/20 px-2.5 py-1 text-[11.5px] font-semibold text-texte-attenue hover:bg-surface-forte disabled:opacity-50"
          >
            {LIBELLE_ISSUE[iss]}
          </button>
        ))}
      </div>
      {derniereCle && <MotifRejet cle={derniereCle} />}
    </form>
  )
}

/** Section « blocs » : B1/B2, essai atteint ou échec (R15/R16). */
function SectionBlocs({ saisie, grimpeur }: { saisie: SaisieRencontre; grimpeur: GrimpeurSaisie }) {
  return (
    <div className="rounded-2xl border border-bordure bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-accent">Bloc</h3>
        <span className="text-[11px] font-bold text-texte-attenue">
          {grimpeur.progression.blocsFaites}/{grimpeur.progression.blocsTotal}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-white/5">
        {grimpeur.blocs.map((b) => {
          const config = saisie.blocsConfig.find((c) => c.blocId === b.blocId)
          return (
            <LigneBloc
              key={b.blocId}
              saisie={saisie}
              grimpeur={grimpeur}
              bloc={b}
              paliers={config?.paliers ?? []}
            />
          )
        })}
      </ul>
    </div>
  )
}

function LigneBloc({
  saisie,
  grimpeur,
  bloc,
  paliers,
}: {
  saisie: SaisieRencontre
  grimpeur: GrimpeurSaisie
  bloc: SaisieBloc
  paliers: BlocConfig['paliers']
}) {
  const { surSoumission } = useEnvoi()
  const cible = { type: 'bloc' as const, grimpeurId: grimpeur.grimpeurId, blocId: bloc.blocId }
  const cle = cleSaisie({ ...cible, issue: 'echec', palierId: null })
  const resume = (valeur: string): ResumeSaisie => ({
    grimpeur: `${grimpeur.prenom} ${grimpeur.nom}`,
    cible: `Bloc ${bloc.code}`,
    valeur,
  })

  const libelleCourant =
    bloc.issue === 'palier'
      ? (bloc.palierLibelle ?? 'Essai')
      : bloc.issue === 'echec'
        ? 'Échec'
        : bloc.issue === 'np'
          ? 'NP'
          : null

  const classeBouton = (actif: boolean, actifClasse: string) =>
    `min-h-11 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50 ${
      actif ? actifClasse : 'border-bordure bg-black/20 text-texte-attenue hover:bg-surface-forte'
    }`

  const suivi = useSuiviEnvoi(!!bloc.enAttente)

  return (
    <li className="flex flex-col gap-2 py-2" data-en-attente={bloc.enAttente ? '' : undefined}>
      <div className="flex items-center gap-2">
        <span className="min-w-9 font-bold text-texte-fort">{bloc.code}</span>
        <span className="ml-auto flex items-center gap-2">
          <EtatEnvoi cle={cle} enAttente={bloc.enAttente} suivi={suivi} />
          {libelleCourant && (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${classeIssue(
                bloc.issue === 'palier' ? 'palier' : bloc.issue,
              )} ${bloc.enAttente && suivi.attenteLongue ? 'border-dashed' : ''}`}
            >
              {libelleCourant}
            </span>
          )}
        </span>
      </div>

      {saisie.ouverteSaisie && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Un bouton par essai (palier), comme les issues de voie. */}
          <form
            onSubmit={surSoumission((fd) => {
              const palierId = String(fd.get('palierId') ?? '')
              return {
                s: { ...cible, issue: 'palier', palierId },
                resume: resume(paliers.find((p) => p.id === palierId)?.libelle ?? 'Palier'),
              }
            })}
            className="flex flex-wrap gap-1.5"
          >
            <input type="hidden" name="rencontreId" value={saisie.id} />
            <input type="hidden" name="blocId" value={bloc.blocId} />
            <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
            <input type="hidden" name="issue" value="palier" />
            {paliers.map((p) => (
              <button
                key={p.id}
                type="submit"
                name="palierId"
                value={p.id}
                className={classeBouton(
                  bloc.issue === 'palier' && bloc.palierId === p.id,
                  classeIssue('palier'),
                )}
              >
                {p.libelle}
              </button>
            ))}
          </form>
          {/* Échec (aucun essai réussi). */}
          <form
            onSubmit={surSoumission(() => ({
              s: { ...cible, issue: 'echec', palierId: null },
              resume: resume('Échec'),
            }))}
          >
            <input type="hidden" name="rencontreId" value={saisie.id} />
            <input type="hidden" name="blocId" value={bloc.blocId} />
            <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
            <input type="hidden" name="palierId" value="" />
            <button
              type="submit"
              name="issue"
              value="echec"
              className={classeBouton(bloc.issue === 'echec', classeIssue('echec'))}
            >
              Échec
            </button>
          </form>
        </div>
      )}
      <MotifRejet cle={cle} />
    </li>
  )
}

/** Vitesse en lecture seule (R22) — saisie par le juge ; points comptés au score (R23). */
function SectionVitesse({ grimpeur }: { grimpeur: GrimpeurSaisie }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-bordure bg-surface px-4 py-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-accent">⚡ Vitesse</h3>
      <span className="text-[11px] font-bold text-texte-doux">
        {grimpeur.vitesse.statut === 'en_attente'
          ? 'en attente'
          : `${libelleVitesse(grimpeur.vitesse)} · ${grimpeur.pointsVitesse} pts`}{' '}
        <span className="font-medium normal-case">· lecture (juge)</span>
      </span>
    </div>
  )
}
