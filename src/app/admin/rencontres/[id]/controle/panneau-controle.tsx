'use client'

import { useMemo, useOptimistic, useState, useTransition } from 'react'

import { filtrerLignes, progression, progressionGlobale, type LigneControle } from '@/domaine/controle'
import { basculerControle } from '@/lib/admin/controle-actions'
import type { ControleRencontre, SupportControle } from '@/lib/admin/controle'

/** Coches en cours d'écriture (optimistes) : horodatage ou `null` (décochée). */
type CochesOptimistes = Record<string, string | null>

function formaterHorodatage(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
}

function classeIssue(libelle: string): string {
  if (libelle === 'Top' || libelle === 'Bloc complet') return 'text-secondaire'
  if (libelle === 'NP' || libelle === 'Échec') return 'text-texte-attenue'
  return 'text-accent-doux'
}

/**
 * Panneau de contrôle (spec #16) — maître-détail responsive : supports (voies
 * puis blocs) avec progression à gauche (R4/R5), lignes du support sélectionné à
 * droite (R6–R9). Coche ligne par ligne, enregistrée immédiatement (R10),
 * affichée de façon optimiste. En ⑤ : lecture seule (R2). L'état d'affichage
 * (support, recherche, filtre) survit aux relectures temps réel (R12bis).
 */
export function PanneauControle({ controle }: { controle: ControleRencontre }) {
  const [selId, setSelId] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [nonControleesSeulement, setNonControleesSeulement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [, demarrer] = useTransition()
  const [optimistes, appliquer] = useOptimistic<CochesOptimistes, { id: string; le: string | null }>(
    {},
    (etat, { id, le }) => ({ ...etat, [id]: le }),
  )

  const lectureSeule = controle.mode === 'lecture'

  // Supports avec les coches optimistes appliquées (progressions cohérentes).
  const supports = useMemo<SupportControle[]>(
    () =>
      controle.supports.map((s) => ({
        ...s,
        lignes: s.lignes.map((l) =>
          l.resultatId in optimistes
            ? {
                ...l,
                controleLe: optimistes[l.resultatId] ?? null,
                controlePar: optimistes[l.resultatId] ? l.controlePar : null,
              }
            : l,
        ),
      })),
    [controle.supports, optimistes],
  )

  const global = progressionGlobale(supports.map((s) => s.lignes))
  const selected = selId ? (supports.find((s) => s.id === selId) ?? null) : null

  const basculer = (s: SupportControle, l: LigneControle) => {
    const coche = l.controleLe === null
    const le = coche ? new Date().toISOString() : null
    setErreur(null)
    demarrer(async () => {
      appliquer({ id: l.resultatId, le })
      const etat = await basculerControle(s.type, l.resultatId, coche)
      if (etat?.erreur) setErreur(etat.erreur)
    })
  }

  if (supports.length === 0) {
    return (
      <p className="rounded-2xl border border-bordure bg-surface p-4 text-sm text-texte-attenue">
        Aucune voie ni aucun bloc dans cette rencontre.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`rounded-xl border px-4 py-3 text-xs ${
          lectureSeule
            ? 'border-secondaire/25 bg-secondaire/[0.06] text-secondaire'
            : 'border-admin/25 bg-admin/[0.06] text-admin'
        }`}
      >
        {lectureSeule
          ? 'Résultats officiels : contrôle consultable en lecture seule.'
          : "Fiche du juge en main : cochez chaque ligne dont l'issue concorde. En cas d'écart, laissez non coché et corrigez via la saisie admin."}
        <div className="mt-2 flex items-center gap-3">
          <span className="font-bold">
            {global.controlees}/{global.total} lignes contrôlées
          </span>
          <span className="h-1.5 max-w-xs flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full bg-secondaire"
              style={{ width: `${global.total ? (100 * global.controlees) / global.total : 0}%` }}
            />
          </span>
        </div>
      </div>

      {erreur && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {erreur}
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start lg:gap-4">
        {/* MAÎTRE — voies puis blocs (R4/R5) */}
        <nav aria-label="Voies et blocs" className={selected ? 'hidden lg:block' : 'block'}>
          <ListeSupports
            titre="Voies de difficulté"
            supports={supports.filter((s) => s.type === 'voie')}
            selId={selId}
            onChoisir={setSelId}
          />
          <ListeSupports
            titre="Blocs"
            supports={supports.filter((s) => s.type === 'bloc')}
            selId={selId}
            onChoisir={setSelId}
          />
        </nav>

        {/* DÉTAIL — lignes du support (R6–R9) */}
        <section aria-live="polite" className={selected ? 'block' : 'hidden lg:block'}>
          {selected ? (
            <DetailSupport
              support={selected}
              recherche={recherche}
              onRecherche={setRecherche}
              nonControleesSeulement={nonControleesSeulement}
              onFiltre={() => setNonControleesSeulement((v) => !v)}
              lectureSeule={lectureSeule}
              onBasculer={(l) => basculer(selected, l)}
              onRetour={() => setSelId(null)}
            />
          ) : (
            <div className="hidden rounded-2xl border border-dashed border-bordure bg-surface p-8 text-center text-sm text-texte-doux lg:block">
              Sélectionnez une voie ou un bloc pour le contrôler.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ListeSupports({
  titre,
  supports,
  selId,
  onChoisir,
}: {
  titre: string
  supports: SupportControle[]
  selId: string | null
  onChoisir: (id: string) => void
}) {
  if (supports.length === 0) return null
  return (
    <div className="mb-4">
      <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-accent">{titre}</p>
      <ul className="flex flex-col divide-y divide-white/5 rounded-2xl border border-bordure bg-surface">
        {supports.map((s) => {
          const p = progression(s.lignes)
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onChoisir(s.id)}
                className={`flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface-forte ${
                  selId === s.id ? 'bg-admin/10' : ''
                }`}
              >
                <span className="min-w-8 font-bold text-texte-fort">{s.code}</span>
                {s.cotation && <span className="text-xs text-texte-doux">{s.cotation}</span>}
                <span
                  className={`ml-auto whitespace-nowrap text-xs font-bold ${
                    p.complet ? 'text-secondaire' : 'text-texte-attenue'
                  }`}
                >
                  {p.complet && '✓ '}
                  {p.controlees}/{p.total}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function DetailSupport({
  support,
  recherche,
  onRecherche,
  nonControleesSeulement,
  onFiltre,
  lectureSeule,
  onBasculer,
  onRetour,
}: {
  support: SupportControle
  recherche: string
  onRecherche: (v: string) => void
  nonControleesSeulement: boolean
  onFiltre: () => void
  lectureSeule: boolean
  onBasculer: (l: LigneControle) => void
  onRetour: () => void
}) {
  const p = progression(support.lignes)
  const visibles = filtrerLignes(support.lignes, { recherche, nonControleesSeulement })

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 bg-fond px-1 pb-2">
        <button
          type="button"
          onClick={onRetour}
          className="mb-2 text-sm font-semibold text-accent-doux lg:hidden"
        >
          ← Voies et blocs
        </button>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="mr-auto text-lg font-bold text-texte-fort">
            {support.type === 'voie' ? 'Voie' : 'Bloc'} {support.code}
            {support.cotation && ` · ${support.cotation}`}
          </h2>
          <span className="text-sm font-bold text-texte-attenue">
            <b className="text-secondaire">{p.controlees}</b>/{p.total} contrôlées
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="search"
            value={recherche}
            onChange={(e) => onRecherche(e.target.value)}
            placeholder="🔍 Rechercher un grimpeur (nom, prénom)…"
            className="min-w-0 flex-[1_1_220px] rounded-xl border border-bordure bg-black/30 px-3 py-2.5 text-base text-texte-fort [color-scheme:dark] placeholder:text-texte-doux"
          />
          <button
            type="button"
            aria-pressed={nonControleesSeulement}
            onClick={onFiltre}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
              nonControleesSeulement
                ? 'border-admin/50 bg-admin/15 text-admin'
                : 'border-bordure bg-black/30 text-texte-attenue'
            }`}
          >
            Non contrôlées seulement
          </button>
        </div>
        <p className="mt-2 px-1 text-[11px] font-semibold text-texte-doux">
          {visibles.length === p.total
            ? `${p.total} grimpeur(s)`
            : `${visibles.length} affiché(s) sur ${p.total}`}
        </p>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-bordure p-6 text-center text-sm text-texte-doux">
          {p.total === 0 ? 'Aucun résultat sur ce support.' : 'Aucune ligne à afficher.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {visibles.map((l) => {
            const cochee = l.controleLe !== null
            return (
              <li
                key={l.resultatId}
                className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border py-1 pl-3 pr-1.5 ${
                  cochee ? 'border-secondaire/35 bg-secondaire/[0.05]' : 'border-bordure bg-surface'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-texte-fort">
                    {l.nom.toUpperCase()} {l.prenom}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-texte-doux">
                    <span>{l.clubNom}</span>
                    {l.clubAccueilNom && (
                      <span className="rounded-full border border-prete/35 bg-prete/10 px-1.5 font-bold text-prete">
                        prêté → {l.clubAccueilNom}
                      </span>
                    )}
                    {cochee && (
                      <span
                        className="text-secondaire"
                        title={`Contrôlé${l.controlePar ? ` par ${l.controlePar}` : ''} le ${formaterHorodatage(l.controleLe!)}`}
                      >
                        ✓ {l.controlePar ?? '…'}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`whitespace-nowrap rounded-lg bg-surface-forte px-2.5 py-1 text-sm font-bold ${classeIssue(l.issueLibelle)}`}
                >
                  {l.issueLibelle}
                </span>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={cochee}
                  aria-label={`Contrôlé : ${l.nom} ${l.prenom}`}
                  disabled={lectureSeule}
                  onClick={() => onBasculer(l)}
                  className={`grid h-11 w-11 place-items-center rounded-lg border-2 text-xl font-bold transition disabled:cursor-not-allowed disabled:opacity-75 ${
                    cochee
                      ? 'border-secondaire bg-secondaire/15 text-secondaire'
                      : 'border-bordure bg-black/30 text-transparent'
                  }`}
                >
                  ✓
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
