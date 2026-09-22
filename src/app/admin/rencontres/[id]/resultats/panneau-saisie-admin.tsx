'use client'

import { useMemo, useState } from 'react'

import { issuesVoieSaisissables, type IssueVoie } from '@/domaine/resultat'
import {
  retirerResultatVoieAdmin,
  saisirResultatBlocAdmin,
  saisirResultatVoieAdmin,
  type EtatSaisie,
} from '@/lib/admin/resultats-actions'
import type { SaisieAdminRencontre, SaisieClub } from '@/lib/admin/resultats'
import type {
  BlocConfig,
  GrimpeurSaisie,
  SaisieBloc,
  SaisieVoie,
  VoieOption,
} from '@/lib/coach/resultats'
import { useActionState } from 'react'

const etatInitial: EtatSaisie = undefined

const LIBELLE_ISSUE: Record<IssueVoie, string> = {
  top: 'Top',
  prise_valorisee: 'Prise valorisée',
  zone2: 'Zone 2',
  zone1: 'Zone 1',
  echec: 'Échec',
  np: 'NP',
}

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

/** Grimpeur + nom de son club (pour la liste à plat et la recherche). */
type GrimpeurAvecClub = GrimpeurSaisie & { clubNom: string }

/**
 * Panneau de saisie/correction admin (spec #9) — maître-détail responsive : liste
 * des grimpeurs tous clubs à gauche, saisie du grimpeur sélectionné à droite
 * (voies + blocs). Sur mobile, la liste et le détail se remplacent. Les écritures
 * passent par les Server Actions admin (garde rôle + phase ③/④).
 */
export function PanneauSaisieAdmin({ saisie }: { saisie: SaisieAdminRencontre }) {
  const [selId, setSelId] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [clubFiltre, setClubFiltre] = useState<string>('tous')

  const tousGrimpeurs = useMemo<GrimpeurAvecClub[]>(
    () =>
      saisie.clubs.flatMap((c) =>
        c.grimpeurs.map((g) => ({ ...g, clubNom: c.clubNom })),
      ),
    [saisie.clubs],
  )

  const selected = selId ? tousGrimpeurs.find((g) => g.grimpeurId === selId) ?? null : null

  const clubsFiltres = useMemo<SaisieClub[]>(() => {
    const q = recherche.trim().toLowerCase()
    return saisie.clubs
      .filter((c) => clubFiltre === 'tous' || c.clubId === clubFiltre)
      .map((c) => ({
        ...c,
        grimpeurs: c.grimpeurs.filter(
          (g) => !q || `${g.prenom} ${g.nom}`.toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.grimpeurs.length > 0)
  }, [saisie.clubs, recherche, clubFiltre])

  const total = tousGrimpeurs.length

  if (total === 0) {
    return (
      <p className="rounded-2xl border border-bordure bg-surface p-4 text-sm text-texte-attenue">
        Aucun grimpeur engagé dans cette rencontre.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {!saisie.ouverteSaisie && (
        <p className="rounded-xl border border-bordure bg-surface px-4 py-3 text-sm text-texte-attenue">
          La saisie admin n’est ouverte qu’en compétition (③) ou clôture (④). Les
          résultats restent consultables.
        </p>
      )}
      <p className="rounded-xl border border-admin/25 bg-admin/[0.06] px-4 py-3 text-xs text-admin">
        Saisie <strong>administrateur</strong> : tout grimpeur, tous clubs (R2).
        Écritures tracées ; résultats visibles de tous au fil de l’eau (non
        officiels jusqu’à la ⑤).
      </p>

      <div className="lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-4">
        {/* MAÎTRE — liste tous clubs */}
        <div className={selected ? 'hidden lg:block' : 'block'}>
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="🔍 Rechercher un grimpeur (tous clubs)…"
            className="mb-2 w-full rounded-xl border border-bordure bg-black/30 px-3 py-2.5 text-base text-texte-fort [color-scheme:dark] placeholder:text-texte-doux"
          />
          <div className="mb-2 flex flex-wrap gap-1.5">
            <ChipClub actif={clubFiltre === 'tous'} onClick={() => setClubFiltre('tous')}>
              Tous
            </ChipClub>
            {saisie.clubs.map((c) => (
              <ChipClub
                key={c.clubId}
                actif={clubFiltre === c.clubId}
                onClick={() => setClubFiltre(c.clubId)}
              >
                {c.clubNom}
              </ChipClub>
            ))}
          </div>
          <p className="mb-2 px-1 text-[11px] font-semibold text-texte-doux">
            <b className="text-texte-fort">{total}</b> grimpeur(s) ·{' '}
            <b className="text-texte-fort">{saisie.clubs.length}</b> club(s)
          </p>

          {clubsFiltres.length === 0 ? (
            <p className="rounded-2xl border border-bordure bg-surface p-4 text-sm text-texte-attenue">
              Aucun grimpeur pour ce filtre.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {clubsFiltres.map((c) => (
                <div key={c.clubId}>
                  <p className="mb-1 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wide text-admin">
                    {c.clubNom}
                    <span className="font-medium normal-case text-texte-doux">
                      · {c.grimpeurs.length}
                    </span>
                  </p>
                  <ul className="flex flex-col divide-y divide-white/5 rounded-2xl border border-bordure bg-surface">
                    {c.grimpeurs.map((g) => (
                      <li key={g.grimpeurId}>
                        <button
                          type="button"
                          onClick={() => setSelId(g.grimpeurId)}
                          className={`flex w-full items-center gap-2 px-3 py-3 text-left transition hover:bg-surface-forte ${
                            selId === g.grimpeurId ? 'bg-admin/10' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-texte-fort">
                              {g.prenom} {g.nom}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-texte-doux">
                              <span className="rounded-full border border-accent/30 bg-accent/10 px-1.5 font-bold text-accent-doux">
                                {g.equipeNom}
                              </span>
                              {g.prete && (
                                <span className="rounded-full border border-prete/35 bg-prete/10 px-1.5 font-bold uppercase text-prete">
                                  Prêté
                                </span>
                              )}
                              <span className="font-bold">
                                🧗 {g.progression.voiesFaites}/{g.voiesTotal} · 🧱{' '}
                                {g.progression.blocsFaites}/{g.progression.blocsTotal}
                              </span>
                            </div>
                          </div>
                          <span className="ml-auto whitespace-nowrap text-right">
                            <span
                              className={`font-extrabold ${g.score > 0 ? 'text-secondaire' : 'text-texte-doux'}`}
                            >
                              {g.score}
                            </span>
                            <span className="ml-0.5 text-[9.5px] font-bold text-texte-doux">
                              pts
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DÉTAIL — saisie du grimpeur sélectionné */}
        <div className={selected ? 'block' : 'hidden lg:block'}>
          {selected ? (
            <DetailGrimpeur
              saisie={saisie}
              grimpeur={selected}
              onRetour={() => setSelId(null)}
            />
          ) : (
            <div className="hidden rounded-2xl border border-dashed border-bordure bg-surface p-8 text-center text-sm text-texte-doux lg:block">
              Sélectionnez un grimpeur pour saisir ou corriger ses résultats.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChipClub({
  actif,
  onClick,
  children,
}: {
  actif: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[34px] rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        actif
          ? 'border-admin/50 bg-admin/20 text-admin'
          : 'border-bordure bg-black/25 text-texte-attenue hover:bg-surface-forte'
      }`}
    >
      {children}
    </button>
  )
}

/** Détail d'un grimpeur : en-tête + score, voies et blocs côte à côte (desktop). */
function DetailGrimpeur({
  saisie,
  grimpeur,
  onRetour,
}: {
  saisie: SaisieAdminRencontre
  grimpeur: GrimpeurAvecClub
  onRetour: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onRetour}
        className="self-start text-sm text-texte-attenue hover:text-texte-fort lg:hidden"
      >
        ← Liste des grimpeurs
      </button>

      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <p className="text-lg font-bold text-texte-fort">
            {grimpeur.prenom} {grimpeur.nom}
          </p>
          <p className="mt-1 text-xs text-texte-attenue">
            {saisie.categorie} · <strong>{grimpeur.clubNom}</strong> ·{' '}
            {grimpeur.equipeNom}
            {grimpeur.prete ? ' · prêté' : ''}
            {grimpeur.groupeDepart ? ` · groupe ${grimpeur.groupeDepart}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-secondaire/25 bg-secondaire/5 px-4 py-2">
          <div>
            <p className="text-[11px] font-semibold text-texte-attenue">
              Score (voie + bloc)
            </p>
            <p className="text-[10px] text-texte-doux">au fil de l’eau · non officiel</p>
          </div>
          <p className="text-2xl font-extrabold text-secondaire">
            {grimpeur.score}
            <span className="ml-1 text-xs font-bold text-texte-doux">pts</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <SectionVoies saisie={saisie} grimpeur={grimpeur} />
        <SectionBlocs saisie={saisie} grimpeur={grimpeur} />
      </div>
    </div>
  )
}

function SectionVoies({
  saisie,
  grimpeur,
}: {
  saisie: SaisieAdminRencontre
  grimpeur: GrimpeurSaisie
}) {
  const estAdo = saisie.categorie === 'ado'
  const dejaSaisies = new Set(grimpeur.voies.map((v) => v.voieDifficulteId))
  const dispoAdo = saisie.voiesEpreuve.filter((v) => !dejaSaisies.has(v.voieDifficulteId))
  const peutAjouterAdo =
    estAdo && saisie.ouverteSaisie && grimpeur.voies.length < grimpeur.voiesTotal

  return (
    <div className="rounded-2xl border border-bordure bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-accent">
          Voie de difficulté
        </h3>
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
        <FormAjoutVoieAdo grimpeur={grimpeur} disponibles={dispoAdo} />
      )}
    </div>
  )
}

function LigneVoie({
  saisie,
  grimpeur,
  voie,
  retirable,
}: {
  saisie: SaisieAdminRencontre
  grimpeur: GrimpeurSaisie
  voie: SaisieVoie
  retirable: boolean
}) {
  const [etat, action, enCours] = useActionState(saisirResultatVoieAdmin, etatInitial)
  const [etatRetrait, actionRetrait] = useActionState(retirerResultatVoieAdmin, etatInitial)
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
            <input type="hidden" name="voieDifficulteId" value={voie.voieDifficulteId} />
            <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
            {issues.map((iss) => (
              <button
                key={iss}
                type="submit"
                name="issue"
                value={iss}
                disabled={enCours}
                className={`min-h-9 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50 ${
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
              <input type="hidden" name="voieDifficulteId" value={voie.voieDifficulteId} />
              <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
              <button
                type="submit"
                aria-label={`Retirer la voie ${voie.niveau}`}
                className="min-h-9 rounded-lg border border-danger/40 px-2 py-1 text-sm text-danger hover:bg-danger/10"
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

function FormAjoutVoieAdo({
  grimpeur,
  disponibles,
}: {
  grimpeur: GrimpeurSaisie
  disponibles: VoieOption[]
}) {
  const [etat, action, enCours] = useActionState(saisirResultatVoieAdmin, etatInitial)
  const issues = issuesVoieSaisissables('ado', 'tete')

  return (
    <form
      action={action}
      className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-bordure bg-accent/[0.03] p-3"
    >
      <input type="hidden" name="grimpeurId" value={grimpeur.grimpeurId} />
      <label className="text-[11px] font-bold uppercase tracking-wide text-accent">
        Ajouter une voie ({grimpeur.voies.length}/{grimpeur.voiesTotal})
        <select
          name="voieDifficulteId"
          required
          defaultValue=""
          className="mt-1 h-10 w-full rounded-lg border border-bordure bg-black/30 px-2 text-sm font-normal normal-case text-texte-fort [color-scheme:dark]"
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
            className="min-h-9 rounded-lg border border-bordure bg-black/20 px-2.5 py-1 text-[11.5px] font-semibold text-texte-attenue hover:bg-surface-forte disabled:opacity-50"
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

function SectionBlocs({
  saisie,
  grimpeur,
}: {
  saisie: SaisieAdminRencontre
  grimpeur: GrimpeurSaisie
}) {
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
  saisie: SaisieAdminRencontre
  grimpeur: GrimpeurSaisie
  bloc: SaisieBloc
  paliers: BlocConfig['paliers']
}) {
  const [etat, action, enCours] = useActionState(saisirResultatBlocAdmin, etatInitial)

  const libelleCourant =
    bloc.issue === 'palier'
      ? (bloc.palierLibelle ?? 'Essai')
      : bloc.issue === 'echec'
        ? 'Échec'
        : bloc.issue === 'np'
          ? 'NP'
          : null

  const classeBouton = (actif: boolean, actifClasse: string) =>
    `min-h-9 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50 ${
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
          <form action={action} className="flex flex-wrap gap-1.5">
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
          <form action={action}>
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
