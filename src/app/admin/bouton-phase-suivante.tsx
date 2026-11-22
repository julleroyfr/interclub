'use client'

import { useState, useTransition } from 'react'

import { Bouton, type TailleBouton } from '@/composants'
import { FenetreModale } from '@/composants/FenetreModale'
import { transitionAConfirmer } from '@/domaine/controle-np'
import { PHASES, type Phase } from '@/domaine/rencontre'
import { lireApercuCloture, type ApercuCloture } from '@/lib/admin/apercu-cloture'

const labelPhase = (v: Phase) => PHASES.find((p) => p.value === v)?.label ?? v

/**
 * Bouton « avancer à la phase suivante » des écrans admin (spec #3 R17, R41a).
 * Le passage ③ → ④ ouvre d'abord la confirmation avec aperçu chiffré (R17bis) ;
 * toute autre transition part directement. L'action reste la garde autoritaire.
 */
export function BoutonPhaseSuivante({
  rencontreId,
  phase,
  suivante,
  action,
  enCours,
  bloquee,
  erreur,
  taille = 'md',
}: {
  rencontreId: string
  phase: Phase
  suivante: Phase
  action: (formData: FormData) => void
  enCours: boolean
  bloquee: boolean
  erreur?: string
  taille?: TailleBouton
}) {
  const [ouverte, setOuverte] = useState(false)
  const [apercu, setApercu] = useState<ApercuCloture | null>(null)
  const [chargement, demarrer] = useTransition()
  const title = bloquee ? 'Activable seulement le jour de la rencontre.' : undefined
  const libelle = `${labelPhase(suivante)} →`

  const champs = (
    <>
      <input type="hidden" name="id" value={rencontreId} />
      <input type="hidden" name="phase" value={suivante} />
    </>
  )

  if (!transitionAConfirmer(phase, suivante)) {
    return (
      <form action={action}>
        {champs}
        <Bouton
          type="submit"
          taille={taille}
          disabled={enCours || bloquee}
          title={title}
          aria-label="Avancer à la phase suivante"
        >
          {libelle}
        </Bouton>
      </form>
    )
  }

  const ouvrir = () => {
    setApercu(null)
    setOuverte(true)
    // Aperçu calculé à l'ouverture (R17bis c) : il reflète les saisies du moment.
    demarrer(async () => setApercu(await lireApercuCloture(rencontreId)))
  }

  return (
    <>
      <Bouton
        taille={taille}
        disabled={enCours || bloquee}
        title={title}
        aria-label="Avancer à la phase suivante"
        aria-haspopup="dialog"
        onClick={ouvrir}
      >
        {libelle}
      </Bouton>
      <FenetreModale ouverte={ouverte} titre="Clôturer la rencontre ?" onFermer={() => setOuverte(false)}>
        <ul className="list-disc pl-5 text-sm">
          <li>La saisie des coachs, capitaines et juges s’arrête.</li>
          <li>
            Tout ce qui n’a pas été saisi passe en <strong>NP</strong> (0 point). Seul l’admin pourra
            corriger.
          </li>
        </ul>
        <p className="mt-1 text-xs font-bold uppercase tracking-wider text-texte-attenue">
          Manques à la clôture
        </p>
        <ApercuManques apercu={apercu} chargement={chargement} />
        {erreur && (
          <p role="alert" className="text-sm text-danger">
            {erreur}
          </p>
        )}
        <form action={action} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {champs}
          <Bouton variante="secondaire" autoFocus onClick={() => setOuverte(false)}>
            Annuler
          </Bouton>
          <Bouton type="submit" disabled={enCours} className="bg-attention text-slate-950">
            {enCours ? 'Clôture…' : 'Clôturer'}
          </Bouton>
        </form>
      </FenetreModale>
    </>
  )
}

/** Tableau de l'aperçu (R17bis c) : par club et au total ; clubs sans manque exclus. */
function ApercuManques({ apercu, chargement }: { apercu: ApercuCloture | null; chargement: boolean }) {
  if (chargement || !apercu) return <p className="text-sm text-texte-attenue">Calcul des manques…</p>
  if ('erreur' in apercu) return <p className="text-sm text-attention">{apercu.erreur}</p>
  if (apercu.parClub.length === 0) {
    return <p className="text-sm text-secondaire">✓ Toutes les saisies sont complètes.</p>
  }
  const colonneVoies = apercu.categorie === 'enfant' ? 'NP de voie' : 'Voies manquantes'
  const cellule = (n: number) => (
    <td className={`px-1 py-1.5 text-right tabular-nums ${n > 0 ? 'font-bold text-attention' : ''}`}>{n}</td>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-texte-doux">
            <th className="px-1 py-1.5 font-bold">Club</th>
            <th className="px-1 py-1.5 text-right font-bold">{colonneVoies}</th>
            <th className="px-1 py-1.5 text-right font-bold">NP de bloc</th>
            <th className="px-1 py-1.5 text-right font-bold">Vitesses non saisies</th>
          </tr>
        </thead>
        <tbody>
          {apercu.parClub.map((c) => (
            <tr key={c.clubId} className="border-t border-white/5">
              <td className="px-1 py-1.5">{c.clubNom}</td>
              {cellule(c.voies)}
              {cellule(c.blocs)}
              {cellule(c.vitessesNonSaisies)}
            </tr>
          ))}
          <tr className="border-t border-bordure font-bold text-texte-fort">
            <td className="px-1 py-1.5">Total</td>
            {cellule(apercu.total.voies)}
            {cellule(apercu.total.blocs)}
            {cellule(apercu.total.vitessesNonSaisies)}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
