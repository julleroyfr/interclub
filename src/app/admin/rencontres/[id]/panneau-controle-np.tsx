import Link from 'next/link'

import { Carte } from '@/composants'
import { controleNp, elementsFiche, lignesNpParClub, type LigneNp, type SectionNp } from '@/domaine/controle-np'
import type { DonneesControleNp } from '@/lib/admin/controle-np'

const couleurSignal = {
  alerte: 'text-danger',
  attention: 'text-attention',
  neutre: 'text-texte-attenue',
} as const

const lienTelechargement =
  'inline-flex min-h-11 items-center gap-2 rounded-xl border border-bordure bg-surface px-4 text-sm font-semibold text-texte transition hover:bg-surface-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'

/**
 * Onglet « Contrôle des NP » du tableau de bord, en ④/⑤, toutes catégories
 * (spec #3 R41l–R41s) : exports PDF, puis une carte par élément (vitesse, blocs,
 * niveaux ou « Moins de 6 voies ») listant les grimpeurs concernés avec leur
 * fiche complète et leur signal.
 */
export function PanneauControleNp({ donnees }: { donnees: DonneesControleNp }) {
  const { sections } = controleNp(donnees.entree)
  const base = `/admin/rencontres/${donnees.rencontreId}`

  if (sections.length === 0) {
    return (
      <Carte className="p-4">
        <p className="text-sm text-secondaire">✓ Aucun NP : toutes les saisies sont complètes.</p>
      </Carte>
    )
  }

  const clubs = lignesNpParClub({ sections })
  return (
    <div className="flex flex-col gap-4">
      <Carte className="flex flex-col gap-3 p-4 md:flex-row md:flex-wrap md:items-center">
        <span className="text-xs font-bold uppercase tracking-wider text-texte-fort">Exports PDF</span>
        <a href={`${base}/np/pdf`} download className={lienTelechargement}>
          <span aria-hidden="true">⤓</span> PDF par niveau (admin)
        </a>
        <span className="text-xs text-texte-attenue">PDF à envoyer aux coachs :</span>
        <div className="flex flex-wrap gap-2">
          {clubs.map((c) => (
            <a key={c.clubId} href={`${base}/np/pdf?club=${c.clubId}`} download className={lienTelechargement}>
              <span aria-hidden="true">⤓</span> {c.clubNom}
              <span className="font-bold text-danger">{c.lignes.length}</span>
            </a>
          ))}
        </div>
      </Carte>

      {sections.map((s) => (
        <SectionControle key={s.cle} section={s} donnees={donnees} />
      ))}
    </div>
  )
}

function SectionControle({ section, donnees }: { section: SectionNp; donnees: DonneesControleNp }) {
  const attendus =
    section.type === 'niveau'
      ? `${section.voies.length ? `Voies : ${section.voies.join(' · ')} — ` : ''}${section.attendus} grimpeur${section.attendus > 1 ? 's' : ''} sur ce niveau`
      : `${section.attendus} engagé${section.attendus > 1 ? 's' : ''}${section.type === 'voies' ? ' — les voies manquantes comptent 0' : ''}`
  return (
    <Carte className="p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-texte-fort">{section.titre}</h3>
        <span className="text-sm font-bold text-danger">{section.lignes.length} NP</span>
        <span className="basis-full text-xs text-texte-doux">{attendus}</span>
      </div>
      <ul>
        {section.lignes.map((l) => (
          <LigneControle key={l.grimpeur.grimpeurId} ligne={l} donnees={donnees} />
        ))}
      </ul>
    </Carte>
  )
}

function LigneControle({ ligne, donnees }: { ligne: LigneNp; donnees: DonneesControleNp }) {
  const g = ligne.grimpeur
  const nom = `${g.nom} ${g.prenom}`
  const ou = [g.clubNom, g.equipeNom, donnees.categorie === 'enfant' ? (g.groupeDepart ?? 'À définir') : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="grid gap-1 border-t border-white/5 py-2.5 md:grid-cols-[minmax(180px,1.1fr)_2.4fr_minmax(150px,0.9fr)] md:items-center md:gap-3">
      <div>
        {/* Correction directe en ④ (R41q) ; en ⑤ la saisie admin est fermée. */}
        {donnees.phase === 'cloture' ? (
          <Link
            href={`/admin/rencontres/${donnees.rencontreId}/resultats?grimpeur=${g.grimpeurId}`}
            className="text-sm font-bold text-texte-fort underline decoration-accent-doux/50 underline-offset-4 hover:text-accent-doux"
            title="Corriger dans la saisie admin"
          >
            {nom}
          </Link>
        ) : (
          <span className="text-sm font-bold text-texte-fort">{nom}</span>
        )}
        <div className="text-xs text-texte-doux">{ou}</div>
      </div>
      <div className="flex flex-wrap gap-1">
        {elementsFiche(ligne.fiche, donnees.categorie).map((e, i) => (
          <span
            key={i}
            className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
              e.np ? 'bg-danger/15 font-bold text-danger' : 'bg-white/5 text-texte-attenue'
            }`}
          >
            {e.texte}
          </span>
        ))}
      </div>
      <div>
        {ligne.signal && (
          <span className={`text-xs font-bold ${couleurSignal[ligne.signal.niveau]}`}>{ligne.signal.texte}</span>
        )}
      </div>
    </li>
  )
}
