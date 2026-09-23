'use client'

import { useActionState, useMemo, useState } from 'react'

import { issuesVoieSaisissables, type IssueVoie } from '@/domaine/resultat'
import { formaterTempsVitesse } from '@/domaine/vitesse'
import {
  retirerResultatVoie,
  saisirResultatBloc,
  saisirResultatVoie,
  type EtatSaisie,
} from '@/lib/coach/resultats-actions'
import type {
  BlocConfig,
  GrimpeurSaisie,
  SaisieBloc,
  SaisieRencontre,
  SaisieVoie,
  VoieOption,
} from '@/lib/coach/resultats'

const etatInitial: EtatSaisie = undefined

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
export function PanneauResultats({ saisie }: { saisie: SaisieRencontre }) {
  const [vue, setVue] = useState<'equipe' | 'alpha'>('equipe')
  const [selId, setSelId] = useState<string | null>(null)

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
    <div className="flex flex-col gap-4">
      {!saisie.ouverteSaisie && (
        <p className="rounded-xl border border-bordure bg-surface px-4 py-3 text-sm text-texte-attenue">
          La saisie des résultats n’est ouverte qu’en phase compétition (R5). Les
          résultats restent consultables.
        </p>
      )}
      <p className="rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-xs text-accent-doux">
        Résultats visibles de tous au fil de l’eau — non officiels jusqu’à la
        publication (R6). ⚡ Vitesse : saisie par le juge, lecture seule (R22).
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
          <ListeGrimpeurs vue={vue} ordreVue={ordreVue} onChoisir={setSelId} />
        </>
      )}
    </div>
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

/** Compteurs de progression + état vitesse (R20/R22). */
function Chips({ grimpeur }: { grimpeur: GrimpeurSaisie }) {
  const { progression: p, vitesse } = grimpeur
  const chip = 'inline-flex items-center gap-1 rounded-full border border-bordure bg-black/20 px-2 py-0.5 text-[11px] font-bold text-texte-attenue'
  const ok = 'border-secondaire/30 text-secondaire'
  const voiesOk = p.voiesFaites >= p.voiesTotal
  const blocsOk = p.blocsFaites >= p.blocsTotal
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={`${chip} ${voiesOk ? ok : ''}`}>🧗 {p.voiesFaites}/{p.voiesTotal}</span>
      <span className={`${chip} ${blocsOk ? ok : ''}`}>🧱 {p.blocsFaites}/{p.blocsTotal}</span>
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
  vue,
  ordreVue,
  onChoisir,
}: {
  vue: 'equipe' | 'alpha'
  ordreVue: GrimpeurSaisie[]
  onChoisir: (id: string) => void
}) {
  if (vue === 'alpha') {
    return (
      <ul className="flex flex-col divide-y divide-white/5 rounded-2xl border border-bordure bg-surface">
        {ordreVue.map((g) => (
          <LigneGrimpeur key={g.grimpeurId} grimpeur={g} onChoisir={onChoisir} alpha />
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
              <LigneGrimpeur key={g.grimpeurId} grimpeur={g} onChoisir={onChoisir} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function LigneGrimpeur({
  grimpeur,
  onChoisir,
  alpha,
}: {
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
        <Chips grimpeur={grimpeur} />
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

      <SectionVoies saisie={saisie} grimpeur={grimpeur} />
      <SectionBlocs saisie={saisie} grimpeur={grimpeur} />
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

      {!estAdo && grimpeur.voies.length === 0 && (
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
  const [etat, action, enCours] = useActionState(saisirResultatVoie, etatInitial)
  const [etatRetrait, actionRetrait] = useActionState(retirerResultatVoie, etatInitial)
  const issues = issuesVoieSaisissables(saisie.categorie, voie.typeVoie)

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-9 font-bold text-texte-fort">{voie.niveau}</span>
        <span className="text-[11px] text-texte-doux">{voie.cotation}</span>
        {voie.issue && (
          <span
            className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${classeIssue(voie.issue)}`}
          >
            {LIBELLE_ISSUE[voie.issue]}
          </span>
        )}
      </div>

      {saisie.ouverteSaisie && (
        <div className="flex flex-wrap items-center gap-1.5">
          <form action={action} className="flex flex-wrap gap-1.5">
            <input type="hidden" name="rencontreId" value={saisie.id} />
            <input type="hidden" name="voieDifficulteId" value={voie.voieDifficulteId} />
            <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
            {issues.map((iss) => (
              <button
                key={iss}
                type="submit"
                name="issue"
                value={iss}
                disabled={enCours}
                className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50 ${
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
            <form action={actionRetrait}>
              <input type="hidden" name="rencontreId" value={saisie.id} />
              <input type="hidden" name="voieDifficulteId" value={voie.voieDifficulteId} />
              <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
              <button
                type="submit"
                aria-label={`Retirer la voie ${voie.niveau}`}
                className="rounded-lg border border-danger/40 px-2 py-1 text-sm text-danger hover:bg-danger/10"
              >
                ×
              </button>
            </form>
          )}
        </div>
      )}
      {(etat?.erreur || etatRetrait?.erreur) && (
        <p role="alert" className="text-xs text-danger">
          {etat?.erreur ?? etatRetrait?.erreur}
        </p>
      )}
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
  const [etat, action, enCours] = useActionState(saisirResultatVoie, etatInitial)
  // Ado : voies tête → issues Top / Zone 2 / Zone 1 / Échec.
  const issues = issuesVoieSaisissables('ado', 'tete')

  return (
    <form
      action={action}
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
            disabled={enCours}
            className="rounded-lg border border-bordure bg-black/20 px-2.5 py-1 text-[11.5px] font-semibold text-texte-attenue hover:bg-surface-forte disabled:opacity-50"
          >
            {LIBELLE_ISSUE[iss]}
          </button>
        ))}
      </div>
      {etat?.erreur && (
        <p role="alert" className="text-xs text-danger">
          {etat.erreur}
        </p>
      )}
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
  const [etat, action, enCours] = useActionState(saisirResultatBloc, etatInitial)

  const libelleCourant =
    bloc.issue === 'palier'
      ? (bloc.palierLibelle ?? 'Essai')
      : bloc.issue === 'echec'
        ? 'Échec'
        : bloc.issue === 'np'
          ? 'NP'
          : null

  const classeBouton = (actif: boolean, actifClasse: string) =>
    `rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50 ${
      actif ? actifClasse : 'border-bordure bg-black/20 text-texte-attenue hover:bg-surface-forte'
    }`

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-9 font-bold text-texte-fort">{bloc.code}</span>
        {libelleCourant && (
          <span
            className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${classeIssue(
              bloc.issue === 'palier' ? 'palier' : bloc.issue,
            )}`}
          >
            {libelleCourant}
          </span>
        )}
      </div>

      {saisie.ouverteSaisie && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Un bouton par essai (palier), comme les issues de voie. */}
          <form action={action} className="flex flex-wrap gap-1.5">
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
                disabled={enCours}
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
          <form action={action}>
            <input type="hidden" name="rencontreId" value={saisie.id} />
            <input type="hidden" name="blocId" value={bloc.blocId} />
            <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
            <input type="hidden" name="palierId" value="" />
            <button
              type="submit"
              name="issue"
              value="echec"
              disabled={enCours}
              className={classeBouton(bloc.issue === 'echec', classeIssue('echec'))}
            >
              Échec
            </button>
          </form>
        </div>
      )}
      {etat?.erreur && (
        <p role="alert" className="text-xs text-danger">
          {etat.erreur}
        </p>
      )}
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
