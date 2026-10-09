'use client'

import { useState } from 'react'

import type { SaisieLocale } from '@/domaine/hors-ligne'

/** Description lisible d'une saisie, figée à sa création (listes R26/R27). */
export type ResumeSaisie = { grimpeur: string; cible: string; valeur: string }

function heure(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Saisies non envoyées (spec #17 R26/R27) : les **rejetées** (motif, à
 * transmettre à l'organisateur, retirées sur demande) et celles **en attente**
 * (abandon possible après confirmation).
 */
export function ListeSaisies<C extends { resume: ResumeSaisie }>({
  file,
  onAbandonner,
  onRetirer,
  onFermer,
}: {
  file: readonly SaisieLocale<C>[]
  onAbandonner: (id: string) => void
  onRetirer: (id: string) => void
  onFermer: () => void
}) {
  const rejetees = file.filter((s) => s.etat === 'rejetee')
  const enAttente = file.filter((s) => s.etat === 'en_attente')
  const [onglet, setOnglet] = useState<'rejetees' | 'en_attente'>(
    rejetees.length ? 'rejetees' : 'en_attente',
  )
  const liste = onglet === 'rejetees' ? rejetees : enAttente
  const base = 'min-h-10 flex-1 rounded-lg border px-3 text-sm font-semibold'

  return (
    <section
      aria-label="Saisies non envoyées"
      className="flex flex-col gap-3 rounded-2xl border border-bordure bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-texte-fort">Saisies non envoyées</h2>
        <button type="button" onClick={onFermer} className="text-sm text-texte-attenue">
          Fermer
        </button>
      </div>
      <div className="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={onglet === 'rejetees'}
          onClick={() => setOnglet('rejetees')}
          className={`${base} ${onglet === 'rejetees' ? 'border-accent bg-accent text-fond' : 'border-bordure bg-black/20 text-texte-attenue'}`}
        >
          Rejetées ({rejetees.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={onglet === 'en_attente'}
          onClick={() => setOnglet('en_attente')}
          className={`${base} ${onglet === 'en_attente' ? 'border-accent bg-accent text-fond' : 'border-bordure bg-black/20 text-texte-attenue'}`}
        >
          En attente ({enAttente.length})
        </button>
      </div>

      {liste.length === 0 ? (
        <p className="py-2 text-center text-sm italic text-texte-doux">Aucune saisie.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {liste.map((s) => (
            <li
              key={s.id}
              className={`rounded-xl border bg-white/[0.03] p-3 ${s.etat === 'rejetee' ? 'border-danger/35' : 'border-bordure'}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-texte-fort">{s.contenu.resume.grimpeur}</span>
                <span
                  className={`ml-auto text-[10.5px] font-bold uppercase tracking-wide ${s.etat === 'rejetee' ? 'text-danger' : 'text-texte-attenue'}`}
                >
                  {s.etat === 'rejetee' ? '⚠ Rejetée' : '⏳ En attente'}
                </span>
              </div>
              <div className="mt-1 text-xs text-texte-attenue">
                {s.contenu.resume.cible} · <strong className="text-texte">{s.contenu.resume.valeur}</strong>
              </div>
              <div className="text-[11px] text-texte-doux">Saisie à {heure(s.saisiLe)}</div>
              {s.motif && (
                <p className="mt-2 rounded-lg border border-danger/25 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
                  {s.motif}
                </p>
              )}
              <div className="mt-2">
                {s.etat === 'rejetee' ? (
                  <button
                    type="button"
                    onClick={() => onRetirer(s.id)}
                    className="min-h-10 w-full rounded-lg border border-accent/35 text-sm font-semibold text-accent"
                  >
                    Retirer de la liste
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Abandonner cette saisie ? Elle ne sera jamais envoyée.')) {
                        onAbandonner(s.id)
                      }
                    }}
                    className="min-h-10 w-full rounded-lg border border-danger/40 text-sm font-semibold text-danger"
                  >
                    Abandonner
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
