'use client'

import {
  createContext,
  type FormEvent,
  startTransition,
  use,
  useMemo,
  useRef,
  useState,
} from 'react'

import { formaterTempsVitesse, lireSaisieVitesse, ResultatVitesseInvalideError } from '@/domaine/vitesse'
import type { GrimpeurVitesse, IssueVitesse } from '@/lib/juge/vitesse'
import { saisirTempsVitesse, type EtatSaisieVitesse } from '@/lib/juge/vitesse-actions'
import { appliquerVitesseOptimiste, type VitesseOptimiste } from '@/lib/saisie/saisie-optimiste'

/** Délai d'affichage de la confirmation « enregistré » (spec #17 R23). */
const DUREE_CONFIRMATION_MS = 2500

/**
 * Envoi d'un résultat avec affichage IMMÉDIAT (spec #17 R22/R23, spec #10
 * R14bis) : contrôle local de la forme (R13), affichage « en attente », puis la
 * requête ; la réponse confirme ou rejette (retour à la valeur du serveur).
 */
type Envoi = {
  surSoumission: (grimpeurId: string) => (e: FormEvent<HTMLFormElement>) => void
  /** Message par grimpeur : refus local (R13) ou rejet du serveur (R18). */
  messages: Record<string, { texte: string; rejet: boolean }>
  confirmes: Record<string, true>
}

const ContexteEnvoi = createContext<Envoi | null>(null)

function useEnvoi(): Envoi {
  const envoi = use(ContexteEnvoi)
  if (!envoi) throw new Error('useEnvoi hors du panneau de vitesse')
  return envoi
}

function sansCle<T>(dico: Record<string, T>, cle: string): Record<string, T> {
  const copie = { ...dico }
  delete copie[cle]
  return copie
}

/** Libellé court de l'état courant d'un grimpeur (R13). */
function libelleIssue(g: GrimpeurVitesse): string {
  if (g.issue === 'temps' && g.temps != null) return formaterTempsVitesse(g.temps)
  if (g.issue === 'chute') return 'Chute'
  if (g.issue === 'non_presentation') return 'Non prés.'
  return 'à saisir'
}

/** Classe de la pastille d'état selon l'issue. */
function classeIssue(issue: IssueVitesse | null): string {
  switch (issue) {
    case 'temps':
      return 'bg-secondaire text-fond'
    case 'chute':
      return 'bg-danger/10 text-danger border border-danger/30'
    case 'non_presentation':
      return 'bg-white/5 text-texte-attenue border border-bordure'
    default:
      return 'border border-dashed border-bordure text-texte-doux'
  }
}

function trierAlpha(a: GrimpeurVitesse, b: GrimpeurVitesse): number {
  return a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom)
}

/**
 * Panneau de saisie de la vitesse (spec #10). Tous les compétiteurs engagés,
 * groupés Filles / Garçons (R12), en deux colonnes côte à côte sur grand écran
 * (R14c). Recherche par nom et filtre « à saisir » pour tenir le volume (R14b).
 */
export function PanneauVitesse({ grimpeurs: grimpeursServeur }: { grimpeurs: GrimpeurVitesse[] }) {
  // Résultats envoyés sans réponse encore, superposés aux données du serveur
  // (spec #17 R22) : liste, compteurs et filtre « à saisir » en tiennent compte.
  const [enAttente, setEnAttente] = useState<{ id: number; s: VitesseOptimiste }[]>([])
  const prochainId = useRef(0)
  const grimpeurs = useMemo(
    () => enAttente.reduce((acc, e) => appliquerVitesseOptimiste(acc, e.s), grimpeursServeur),
    [grimpeursServeur, enAttente],
  )
  const [messages, setMessages] = useState<Envoi['messages']>({})
  const [confirmes, setConfirmes] = useState<Record<string, true>>({})

  const surSoumission = (grimpeurId: string) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
    // Contrôle local AVANT tout affichage (R13) : une saisie invalide n'est ni
    // affichée ni envoyée.
    let resultat
    try {
      resultat = lireSaisieVitesse(String(fd.get('issue') ?? ''), String(fd.get('temps') ?? ''))
    } catch (err) {
      if (!(err instanceof ResultatVitesseInvalideError)) throw err
      setMessages((m) => ({ ...m, [grimpeurId]: { texte: err.message, rejet: false } }))
      return
    }
    const s: VitesseOptimiste = {
      grimpeurId,
      issue: resultat.type,
      temps: resultat.type === 'temps' ? resultat.secondes : null,
    }
    const id = ++prochainId.current
    setEnAttente((l) => [...l, { id, s }])
    setMessages((m) => sansCle(m, grimpeurId))
    void (async () => {
      let reponse: EtatSaisieVitesse
      try {
        reponse = await saisirTempsVitesse(undefined, fd)
      } catch {
        reponse = { erreur: 'Le résultat n’a pas pu être envoyé. Réessayez.' }
      }
      startTransition(() => setEnAttente((l) => l.filter((x) => x.id !== id)))
      if (reponse?.erreur) {
        const texte = reponse.erreur
        setMessages((m) => ({ ...m, [grimpeurId]: { texte, rejet: true } }))
        return
      }
      setConfirmes((c) => ({ ...c, [grimpeurId]: true }))
      setTimeout(() => setConfirmes((c) => sansCle(c, grimpeurId)), DUREE_CONFIRMATION_MS)
    })()
  }

  const [recherche, setRecherche] = useState('')
  const [filtreASaisir, setFiltreASaisir] = useState(false)
  const [filtreSexe, setFiltreSexe] = useState<'tous' | 'F' | 'H'>('tous')

  // Compteurs par sexe, calculés sur TOUS les grimpeurs (indépendants des
  // filtres d'affichage) — progression séparée Filles / Garçons (R14).
  const statSexe = (s: 'F' | 'H') => {
    const total = grimpeurs.filter((g) => g.sexe === s)
    return { total: total.length, saisis: total.filter((g) => g.issue != null).length }
  }
  const statF = statSexe('F')
  const statG = statSexe('H')
  const aSaisir = grimpeurs.filter((g) => g.issue == null).length

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return grimpeurs.filter((g) => {
      if (filtreASaisir && g.issue != null) return false
      if (!q) return true
      return `${g.nom} ${g.prenom}`.toLowerCase().includes(q)
    })
  }, [grimpeurs, recherche, filtreASaisir])

  const filles = filtres.filter((g) => g.sexe === 'F').sort(trierAlpha)
  const garcons = filtres.filter((g) => g.sexe === 'H').sort(trierAlpha)

  if (grimpeurs.length === 0) {
    return (
      <p className="text-sm text-texte-attenue">
        Aucun compétiteur engagé dans cette rencontre.
      </p>
    )
  }

  const montrerFilles = filtreSexe !== 'H'
  const montrerGarcons = filtreSexe !== 'F'
  const uneColonne = filtreSexe !== 'tous'

  return (
    <ContexteEnvoi value={{ surSoumission, messages, confirmes }}>
    <div className="flex flex-col gap-5">
      {/* Progression séparée par sexe (R14) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CompteurSexe titre="Femmes" couleur="#f0abfc" saisis={statF.saisis} total={statF.total} />
        <CompteurSexe titre="Hommes" couleur="#7dd3fc" saisis={statG.saisis} total={statG.total} />
      </div>

      {/* Outils : recherche + filtre « à saisir » + filtre sexe (R14b) */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un grimpeur (nom, prénom)…"
          className="h-10 flex-1 basis-72 rounded-lg border border-bordure bg-black/30 px-3 text-sm text-texte-fort [color-scheme:dark]"
        />
        <button
          type="button"
          onClick={() => setFiltreASaisir((v) => !v)}
          className={`h-10 rounded-full border px-4 text-sm font-semibold ${
            filtreASaisir
              ? 'border-accent bg-accent/15 text-accent-doux'
              : 'border-bordure bg-black/20 text-texte-attenue'
          }`}
        >
          À saisir ({aSaisir})
        </button>
        {/* Filtre par sexe : Tous / Femmes / Hommes (R14b) */}
        <div className="inline-flex h-10 overflow-hidden rounded-full border border-bordure">
          {(
            [
              ['tous', 'Tous'],
              ['F', 'Femmes'],
              ['H', 'Hommes'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setFiltreSexe(val)}
              className={`px-4 text-sm font-semibold ${
                filtreSexe === val
                  ? 'bg-accent/15 text-accent-doux'
                  : 'bg-black/20 text-texte-attenue hover:bg-surface-forte'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Colonnes par sexe — les deux côte à côte, ou une seule selon le filtre (R12/R14c) */}
      <div className={`grid grid-cols-1 gap-5 ${uneColonne ? '' : 'lg:grid-cols-2'}`}>
        {montrerFilles && (
          <GroupeSexe titre="Femmes" couleur="text-[#f0abfc]" pastille="bg-[#f0abfc]" grimpeurs={filles} />
        )}
        {montrerGarcons && (
          <GroupeSexe titre="Hommes" couleur="text-[#7dd3fc]" pastille="bg-[#7dd3fc]" grimpeurs={garcons} />
        )}
      </div>
    </div>
    </ContexteEnvoi>
  )
}

/** Compteur de progression d'un sexe (saisis / total) avec barre (R14). */
function CompteurSexe({
  titre,
  couleur,
  saisis,
  total,
}: {
  titre: string
  couleur: string
  saisis: number
  total: number
}) {
  const pct = total > 0 ? Math.round((saisis / total) * 100) : 0
  return (
    <div className="flex items-center gap-3 rounded-xl border border-bordure bg-surface px-4 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: couleur }} />
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: couleur }}>
        {titre}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-extrabold tabular-nums text-texte-fort">{saisis}</span>
        <span className="text-xs font-bold text-texte-doux">/ {total}</span>
      </div>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full" style={{ width: `${pct}%`, background: couleur }} />
      </div>
    </div>
  )
}

/** Une colonne « sexe » : en-tête collant + lignes denses. */
function GroupeSexe({
  titre,
  couleur,
  pastille,
  grimpeurs,
}: {
  titre: string
  couleur: string
  pastille: string
  grimpeurs: GrimpeurVitesse[]
}) {
  const saisis = grimpeurs.filter((g) => g.issue != null).length
  return (
    <section className="overflow-hidden rounded-2xl border border-bordure bg-surface">
      <header
        className={`sticky top-0 z-10 flex items-center gap-2 border-b border-bordure bg-[#0a1424] px-4 py-3 text-xs font-extrabold uppercase tracking-wider ${couleur}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${pastille}`} />
        {titre}
        <span className="ml-auto text-[11px] font-semibold normal-case tracking-normal text-texte-doux">
          {grimpeurs.length} · {saisis} saisis
        </span>
      </header>
      {grimpeurs.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm italic text-texte-doux">Aucun grimpeur.</p>
      ) : (
        <ul>
          {grimpeurs.map((g) => (
            <LigneVitesse key={g.grimpeurId} grimpeur={g} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Ligne dense d'un grimpeur : état courant + saisie inline (temps / chute / abs.). */
function LigneVitesse({ grimpeur: g }: { grimpeur: GrimpeurVitesse }) {
  const { surSoumission, messages, confirmes } = useEnvoi()
  const message = messages[g.grimpeurId]

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/5 px-4 py-2 first:border-t-0 hover:bg-surface-forte ${
        g.issue != null ? 'bg-secondaire/[0.04]' : ''
      }`}
    >
      <div className="min-w-0 flex-1 basis-40">
        <div className="truncate text-sm font-semibold text-texte-fort">
          {g.nom} {g.prenom}
        </div>
        <div className="text-[11px] text-texte-doux">{g.clubNom}</div>
      </div>

      {/* État d'envoi (R23) : icône ET texte, pas seulement une couleur. */}
      {g.enAttente ? (
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-texte-attenue">⏳ En attente</span>
      ) : message?.rejet ? (
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-danger">⚠ Rejetée</span>
      ) : confirmes[g.grimpeurId] ? (
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-secondaire">✓ Enregistré</span>
      ) : null}

      <span
        className={`inline-flex min-w-[74px] items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${classeIssue(g.issue)} ${
          g.enAttente ? 'border border-dashed border-current bg-transparent text-secondaire' : ''
        }`}
      >
        {libelleIssue(g)}
      </span>

      <form onSubmit={surSoumission(g.grimpeurId)} className="flex items-center gap-1.5">
        <input type="hidden" name="grimpeurId" value={g.grimpeurId} />
        <input
          key={`${g.grimpeurId}-${g.issue}-${g.temps ?? ''}`}
          type="text"
          name="temps"
          inputMode="decimal"
          defaultValue={g.issue === 'temps' && g.temps != null ? String(g.temps) : ''}
          placeholder="0.000"
          aria-label={`Temps de ${g.nom} ${g.prenom}`}
          className="w-24 rounded-lg border border-bordure bg-black/30 px-2 py-1.5 text-right text-sm tabular-nums text-texte-fort [color-scheme:dark]"
        />
        {/* OK (temps) en premier : la touche Entrée valide le temps saisi (R14c). */}
        <button
          type="submit"
          name="issue"
          value="temps"
          className="rounded-lg border border-accent bg-accent px-2.5 py-1.5 text-xs font-bold text-fond disabled:opacity-50"
        >
          OK
        </button>
        <button
          type="submit"
          name="issue"
          value="chute"
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 ${
            g.issue === 'chute'
              ? 'border-danger/50 bg-danger/15 text-danger'
              : 'border-bordure bg-black/20 text-texte-attenue hover:text-danger'
          }`}
        >
          Chute
        </button>
        <button
          type="submit"
          name="issue"
          value="non_presentation"
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 ${
            g.issue === 'non_presentation'
              ? 'border-bordure bg-surface-forte text-texte-fort'
              : 'border-bordure bg-black/20 text-texte-attenue'
          }`}
        >
          Abs.
        </button>
      </form>

      {message && (
        <p role="alert" className="w-full text-xs text-danger">
          {message.texte}
        </p>
      )}
    </li>
  )
}
