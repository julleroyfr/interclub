'use client'

import { useMemo, useState } from 'react'

import { Carte } from '@/composants'
import type { IssueVoie } from '@/domaine/resultat'
import type {
  ClassementRencontre,
  LigneIndividuel,
} from '@/lib/classement/classement'

const PAGE_SIZE = 20

const LIBELLE_ISSUE_VOIE: Record<IssueVoie, string> = {
  top: 'Top',
  prise_valorisee: 'Prise valorisée',
  zone2: 'Zone 2',
  zone1: 'Zone 1',
  echec: 'Échec',
  np: 'NP',
}

/** Classe de pastille d'issue (top/palier = vert, zone/prise = cyan, échec = rouge, NP = gris). */
function classeIssue(issue: string): string {
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
    default:
      return 'bg-white/5 text-texte-attenue border-bordure'
  }
}

/** Couleur du rang podium (1 = or, 2 = argent, 3 = bronze). */
function classeRang(rang: number): string {
  if (rang === 1) return 'text-attention'
  if (rang === 2) return 'text-texte'
  if (rang === 3) return 'text-prepa'
  return 'text-texte-doux'
}

type Vue = 'individuel' | 'equipe' | 'club'
type SexeVue = 'F' | 'G'
type FiltreClub = 'tous' | 'mien'

/**
 * Panneau de classement (spec #7). Trois vues (individuel par sexe, équipe, club,
 * R12), avec pour l'individuel : recherche, filtres (tous / mon club / équipe),
 * mise en évidence du club consulté, compteur et pagination bas de liste (R12b).
 * Toucher un grimpeur ouvre la décomposition de son score (R13).
 */
export function PanneauClassement({
  classement,
  monClubId,
}: {
  classement: ClassementRencontre
  monClubId: string | null
}) {
  const [vue, setVue] = useState<Vue>('individuel')
  const [sexe, setSexe] = useState<SexeVue>('F')
  const [recherche, setRecherche] = useState('')
  const [filtreClub, setFiltreClub] = useState<FiltreClub>('tous')
  const [equipeFiltre, setEquipeFiltre] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<LigneIndividuel | null>(null)

  const listeSexe = sexe === 'F' ? classement.individuel.filles : classement.individuel.garcons

  // Équipes présentes dans le classement du sexe courant (pour le filtre).
  const equipesDispo = useMemo(() => {
    const vues = new Map<string, string>()
    for (const l of listeSexe) if (l.equipeId && l.equipeNom) vues.set(l.equipeId, l.equipeNom)
    return [...vues.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [listeSexe])

  const filtree = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return listeSexe.filter((l) => {
      if (filtreClub === 'mien' && l.clubOrigineId !== monClubId) return false
      if (equipeFiltre && l.equipeId !== equipeFiltre) return false
      if (q && !`${l.prenom} ${l.nom}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [listeSexe, recherche, filtreClub, equipeFiltre, monClubId])

  const nbMonClub = useMemo(
    () => (monClubId ? listeSexe.filter((l) => l.clubOrigineId === monClubId).length : 0),
    [listeSexe, monClubId],
  )

  const totalPages = Math.max(1, Math.ceil(filtree.length / PAGE_SIZE))
  const pageCourante = Math.min(page, totalPages)
  const debut = (pageCourante - 1) * PAGE_SIZE
  const pageLignes = filtree.slice(debut, debut + PAGE_SIZE)

  // Réinitialise la pagination quand la sélection change.
  function reinit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  if (!classement.visible) {
    return (
      <Carte className="p-4 text-sm text-texte-attenue">
        Le classement sera disponible dès l’ouverture de la compétition (③). Aucun
        résultat n’existe pour l’instant.
      </Carte>
    )
  }

  if (detail) {
    return (
      <DecompositionScore
        ligne={detail}
        officiel={classement.officiel}
        onRetour={() => setDetail(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bascule de vue (R12) */}
      <div className="flex gap-1.5">
        {(
          [
            ['individuel', 'Individuel'],
            ['equipe', 'Par équipe'],
            ['club', 'Par club'],
          ] as [Vue, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setVue(v)}
            className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold transition ${
              vue === v
                ? 'border-accent bg-accent text-fond'
                : 'border-bordure bg-black/25 text-texte-attenue hover:bg-surface-forte'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="rounded-xl border border-bordure bg-white/5 px-3 py-2 text-xs text-texte-attenue">
        {classement.officiel
          ? 'Rencontre publiée (⑤) : classement officiel et figé (R10).'
          : 'Recalculé à chaque saisie — non officiel jusqu’à la publication (⑤). La vitesse n’entre pas encore dans le score (R14).'}
      </p>

      {vue === 'individuel' && (
        <>
          {/* Sous-bascule par sexe (R8b) */}
          <div className="flex gap-1.5">
            {(
              [
                ['F', 'Filles'],
                ['G', 'Garçons'],
              ] as [SexeVue, string][]
            ).map(([s, label]) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  reinit(setSexe)(s)
                  setEquipeFiltre('')
                }}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-semibold transition ${
                  sexe === s
                    ? 'border-accent bg-accent text-fond'
                    : 'border-bordure bg-black/25 text-texte-attenue hover:bg-surface-forte'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Recherche (R12b) */}
          <input
            type="search"
            value={recherche}
            onChange={(e) => reinit(setRecherche)(e.target.value)}
            placeholder="🔍 Rechercher un nom…"
            className="w-full rounded-xl border border-bordure bg-black/30 px-3 py-2 text-sm text-texte-fort [color-scheme:dark] placeholder:text-texte-doux"
          />

          {/* Filtres rapides (R12b) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <FiltreChip actif={filtreClub === 'tous'} onClick={() => reinit(setFiltreClub)('tous')}>
              Tous les clubs
            </FiltreChip>
            <FiltreChip
              actif={filtreClub === 'mien'}
              onClick={() => reinit(setFiltreClub)('mien')}
              disabled={!monClubId}
            >
              Mon club
            </FiltreChip>
            {equipesDispo.length > 0 && (
              <select
                value={equipeFiltre}
                onChange={(e) => reinit(setEquipeFiltre)(e.target.value)}
                className="rounded-full border border-bordure bg-black/30 px-3 py-1.5 text-xs font-semibold text-texte-fort [color-scheme:dark]"
              >
                <option value="" className="bg-fond text-texte">
                  Toutes les équipes
                </option>
                {equipesDispo.map(([eqId, eqNom]) => (
                  <option key={eqId} value={eqId} className="bg-fond text-texte">
                    {eqNom}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Compteur (R12b) */}
          <p className="text-xs font-semibold text-texte-doux">
            <b className="text-texte-fort">{filtree.length}</b>{' '}
            {sexe === 'F' ? 'grimpeuse(s)' : 'grimpeur(s)'}
            {nbMonClub > 0 && (
              <>
                {' · '}
                <b className="text-accent-doux">{nbMonClub}</b> de mon club en évidence
              </>
            )}
          </p>

          {pageLignes.length === 0 ? (
            <Carte className="p-4 text-sm text-texte-attenue">Aucun grimpeur pour ce filtre.</Carte>
          ) : (
            <Carte className="p-2">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-texte-doux">
                    <th className="px-1.5 py-1 text-left font-semibold">#</th>
                    <th className="px-1.5 py-1 text-left font-semibold">
                      {sexe === 'F' ? 'Grimpeuse' : 'Grimpeur'}
                    </th>
                    <th className="px-1.5 py-1 text-right font-semibold">Score</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageLignes.map((l) => {
                    const mien = !!monClubId && l.clubOrigineId === monClubId
                    return (
                      <tr
                        key={l.grimpeurId}
                        onClick={() => setDetail(l)}
                        className={`cursor-pointer border-t border-white/5 transition hover:bg-surface-forte ${
                          mien ? 'bg-accent/5' : ''
                        }`}
                      >
                        <td
                          className={`w-8 px-1.5 py-2 text-center text-sm font-extrabold ${classeRang(l.rang)}`}
                        >
                          {l.rang}
                        </td>
                        <td className={`px-1.5 py-2 ${mien ? 'shadow-[inset_3px_0_0_var(--color-accent)]' : ''}`}>
                          <span className="font-semibold text-texte-fort">
                            {l.prenom} {l.nom}
                          </span>
                          {l.equipeNom && (
                            <span className="ml-1.5 inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-1.5 text-[10px] font-bold text-accent-doux">
                              {l.equipeNom}
                            </span>
                          )}
                          <span className="mt-0.5 block text-[11.5px] text-texte-doux">
                            {l.clubOrigineNom}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-2 text-right font-extrabold text-secondaire">
                          {l.score}
                          <span className="ml-0.5 text-[9.5px] font-bold text-texte-doux">pts</span>
                          <span className="block text-[10px] font-semibold text-texte-doux">
                            voie {l.decomposition.totalVoie} · bloc {l.decomposition.totalBloc}
                          </span>
                        </td>
                        <td className="w-4 pr-1 text-right text-texte-doux">›</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <Pagination
                courante={pageCourante}
                total={totalPages}
                onPage={(p) => setPage(p)}
              />
              <p className="mt-1.5 text-center text-[11px] text-texte-doux">
                Page {pageCourante} sur {totalPages} · {debut + 1}–
                {Math.min(debut + PAGE_SIZE, filtree.length)} sur {filtree.length}
              </p>
            </Carte>
          )}
        </>
      )}

      {vue === 'equipe' && (
        <Carte className="p-2">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-texte-doux">
                <th className="px-1.5 py-1 text-left font-semibold">#</th>
                <th className="px-1.5 py-1 text-left font-semibold">Équipe</th>
                <th className="px-1.5 py-1 text-right font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {classement.equipes.map((e) => (
                <tr key={e.equipeId} className="border-t border-white/5">
                  <td className={`w-8 px-1.5 py-2 text-center text-sm font-extrabold ${classeRang(e.rang)}`}>
                    {e.rang}
                  </td>
                  <td className="px-1.5 py-2">
                    <span className="font-semibold text-texte-fort">{e.equipeNom}</span>
                    <span className="mt-0.5 block text-[11.5px] text-texte-doux">
                      {e.clubNom} · {e.nbGrimpeurs} grimpeur(s)
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-2 text-right font-extrabold text-secondaire">
                    {e.score}
                    <span className="ml-0.5 text-[9.5px] font-bold text-texte-doux">pts</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {classement.equipes.length === 0 && (
            <p className="p-3 text-sm text-texte-attenue">Aucune équipe engagée.</p>
          )}
        </Carte>
      )}

      {vue === 'club' && (
        <Carte className="p-2">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-texte-doux">
                <th className="px-1.5 py-1 text-left font-semibold">#</th>
                <th className="px-1.5 py-1 text-left font-semibold">Club</th>
                <th className="px-1.5 py-1 text-right font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {classement.clubs.map((c) => (
                <tr key={c.clubId} className="border-t border-white/5">
                  <td className={`w-8 px-1.5 py-2 text-center text-sm font-extrabold ${classeRang(c.rang)}`}>
                    {c.rang}
                  </td>
                  <td className="px-1.5 py-2 font-semibold text-texte-fort">{c.clubNom}</td>
                  <td className="whitespace-nowrap px-1.5 py-2 text-right font-extrabold text-secondaire">
                    {c.score}
                    <span className="ml-0.5 text-[9.5px] font-bold text-texte-doux">pts</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {classement.clubs.length === 0 && (
            <p className="p-3 text-sm text-texte-attenue">Aucun club engagé.</p>
          )}
        </Carte>
      )}
    </div>
  )
}

function FiltreChip({
  actif,
  disabled,
  onClick,
  children,
}: {
  actif: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
        actif
          ? 'border-accent/50 bg-accent/15 text-accent-doux'
          : 'border-bordure bg-black/25 text-texte-attenue hover:bg-surface-forte'
      }`}
    >
      {children}
    </button>
  )
}

/** Numéros de page compacts (façon moteur de recherche) — 1 … n autour du courant. */
function numerosPage(courante: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, total, courante, courante - 1, courante + 1])
  const tri = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  let prec = 0
  for (const p of tri) {
    if (p - prec > 1) out.push('gap')
    out.push(p)
    prec = p
  }
  return out
}

function Pagination({
  courante,
  total,
  onPage,
}: {
  courante: number
  total: number
  onPage: (p: number) => void
}) {
  if (total <= 1) return null
  return (
    <nav className="mt-2.5 flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
      <BoutonPage disabled={courante === 1} onClick={() => onPage(courante - 1)}>
        ‹ Préc.
      </BoutonPage>
      {numerosPage(courante, total).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="min-w-4 text-center text-texte-doux">
            …
          </span>
        ) : (
          <BoutonPage key={p} actif={p === courante} onClick={() => onPage(p)}>
            {p}
          </BoutonPage>
        ),
      )}
      <BoutonPage disabled={courante === total} onClick={() => onPage(courante + 1)}>
        Suiv. ›
      </BoutonPage>
    </nav>
  )
}

function BoutonPage({
  actif,
  disabled,
  onClick,
  children,
}: {
  actif?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-bold transition disabled:opacity-30 ${
        actif
          ? 'border-accent bg-accent text-fond'
          : 'border-bordure bg-black/25 text-accent-doux hover:bg-surface-forte'
      }`}
    >
      {children}
    </button>
  )
}

/** Décomposition d'un score individuel (R13) : sous-totaux + détail voie/bloc. */
function DecompositionScore({
  ligne,
  officiel,
  onRetour,
}: {
  ligne: LigneIndividuel
  officiel: boolean
  onRetour: () => void
}) {
  const d = ligne.decomposition
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onRetour}
        className="self-start text-sm text-texte-attenue hover:text-texte-fort"
      >
        ← Retour au classement
      </button>

      <div>
        <p className="text-lg font-bold text-texte-fort">
          {ligne.prenom} {ligne.nom}
        </p>
        <p className="text-xs text-texte-doux">
          {ligne.clubOrigineNom}
          {ligne.equipeNom ? ` · ${ligne.equipeNom}` : ''}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl border border-secondaire/25 bg-secondaire/5 px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-texte-attenue">Score individuel</p>
          <p className="text-xs text-texte-doux">
            rang {ligne.rang} · {officiel ? 'officiel' : 'non officiel (R10)'}
          </p>
        </div>
        <p className="text-2xl font-extrabold text-secondaire">
          {ligne.score}
          <span className="ml-1 text-xs font-bold text-texte-doux">pts</span>
        </p>
      </div>

      <SectionDecomp titre="Voies" sousTotal={d.totalVoie}>
        {d.voies.length === 0 ? (
          <p className="px-1 py-2 text-sm text-texte-doux">Aucune voie saisie.</p>
        ) : (
          d.voies.map((v, i) => (
            <LigneDecomp
              key={`${v.libelle}-${i}`}
              code={v.libelle}
              cotation={v.cotation}
              issue={v.issue}
              issueLibelle={LIBELLE_ISSUE_VOIE[v.issue]}
              points={v.points}
            />
          ))
        )}
      </SectionDecomp>

      <SectionDecomp titre="Blocs" sousTotal={d.totalBloc}>
        {d.blocs.length === 0 ? (
          <p className="px-1 py-2 text-sm text-texte-doux">Aucun bloc saisi.</p>
        ) : (
          d.blocs.map((b, i) => (
            <LigneDecomp
              key={`${b.code}-${i}`}
              code={b.code}
              cotation={null}
              issue={b.issue}
              issueLibelle={b.issueLibelle}
              points={b.points}
            />
          ))
        )}
      </SectionDecomp>

      <p className="rounded-xl border border-dashed border-accent/25 bg-accent/5 px-3 py-2 text-[11px] italic text-texte-doux">
        ⚡ La vitesse n’entre pas encore dans le score (R14) : son intégration
        (points par rang, classements Filles/Garçons) fera l’objet d’une révision.
      </p>
    </div>
  )
}

function SectionDecomp({
  titre,
  sousTotal,
  children,
}: {
  titre: string
  sousTotal: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
        <span className="text-accent">{titre}</span>
        <span className="text-secondaire">{sousTotal} pts</span>
      </div>
      <Carte className="p-1">{children}</Carte>
    </div>
  )
}

function LigneDecomp({
  code,
  cotation,
  issue,
  issueLibelle,
  points,
}: {
  code: string
  cotation: string | null
  issue: string
  issueLibelle: string
  points: number
}) {
  return (
    <div className="flex items-center gap-2 border-t border-white/5 px-1.5 py-2 text-sm first:border-t-0">
      <span className="min-w-9 font-bold text-texte-fort">{code}</span>
      {cotation && <span className="text-[11px] text-texte-doux">{cotation}</span>}
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${classeIssue(issue)}`}
      >
        {issueLibelle}
      </span>
      <span
        className={`ml-auto font-bold ${points > 0 ? 'text-secondaire' : 'text-texte-doux'}`}
      >
        {points}
      </span>
    </div>
  )
}
