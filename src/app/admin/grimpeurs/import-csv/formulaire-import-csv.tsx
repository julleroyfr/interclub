'use client'

import { useActionState, useId } from 'react'

import { Bouton, Carte, ChampSelect, TitreSection } from '@/composants'
import type { OptionClub } from '@/lib/grimpeurs/grimpeurs'
import type { CompteRenduImportCsv, EtatImportCsv } from '@/lib/grimpeurs/import-csv'
import { importerGrimpeursCsv } from '@/lib/grimpeurs/import-csv-actions'

const etatInitial: EtatImportCsv = undefined

/**
 * Formulaire d'import CSV sans licence (spec #18) : choix du club cible (R3),
 * dépôt d'un `.csv` (R4), puis compte-rendu (R17). L'année de référence du
 * filtre d'âge est calculée côté serveur (R11), non saisie.
 */
export function FormulaireImportCsv({ clubs }: { clubs: OptionClub[] }) {
  const [etat, action, enCours] = useActionState(importerGrimpeursCsv, etatInitial)
  const idClub = useId()
  const idFichier = useId()

  return (
    <div className="flex flex-col gap-6">
      <Carte className="max-w-2xl p-6">
        <TitreSection>Club cible &amp; fichier</TitreSection>
        <form action={action} className="mt-4 flex flex-col gap-4">
          <ChampSelect
            id={idClub}
            name="clubId"
            label="Club cible"
            options={clubs.map((c) => ({ value: c.id, label: c.nom }))}
            placeholder="— Choisir un club —"
            indice="Tous les grimpeurs du fichier sont rattachés à ce club ; le rapprochement ne porte que sur ses grimpeurs."
            defaultValue=""
            required
          />
          <div>
            <label
              htmlFor={idFichier}
              className="text-xs font-medium uppercase tracking-wide text-texte-attenue"
            >
              Fichier des grimpeurs (.csv)
            </label>
            <input
              id={idFichier}
              name="fichier"
              type="file"
              accept=".csv,text/csv"
              required
              className="mt-1 block w-full rounded-xl border border-bordure bg-black/30 px-4 py-3 text-base text-texte-fort file:mr-4 file:rounded-lg file:border-0 file:bg-admin/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-admin hover:file:bg-admin/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <p className="mt-1 text-xs text-texte-doux">
              UTF-8, séparateur virgule ou point-virgule, en-têtes QUALITE (M / MME), NOM, PRENOM,
              DATNAISS (AAAA-MM-JJ). Seuls les grimpeurs de 18 ans au plus à la fin de la saison en
              cours sont importés.
            </p>
          </div>

          {etat?.erreur && (
            <p role="alert" className="text-sm text-danger">
              {etat.erreur}
            </p>
          )}

          <Bouton type="submit" disabled={enCours} pleineLargeur>
            {enCours ? 'Import en cours…' : 'Lancer l’import'}
          </Bouton>
        </form>
      </Carte>

      {etat?.compteRendu && <CompteRendu cr={etat.compteRendu} />}
    </div>
  )
}

function CompteRendu({ cr }: { cr: CompteRenduImportCsv }) {
  return (
    <Carte className="max-w-2xl p-6">
      <TitreSection>Compte-rendu de l’import</TitreSection>
      <p className="mt-1 text-sm text-secondaire">
        ✅ Import terminé — club <strong>{cr.club}</strong> · année de référence{' '}
        <strong>{cr.anneeReference}</strong> · seuil de naissance{' '}
        <strong>{cr.seuilAnneeNaissance}</strong> · {cr.totalLignes} ligne
        {cr.totalLignes > 1 ? 's' : ''} traitée{cr.totalLignes > 1 ? 's' : ''}.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat valeur={cr.crees} label="Créés (licence générée)" ton="text-secondaire" />
        <Stat valeur={cr.dejaPresents} label="Déjà présents" ton="text-accent" />
        <Stat valeur={cr.ignoresHorsAge} label="Ignorés (hors âge)" ton="text-texte-attenue" />
        <Stat valeur={cr.erreurs.length} label="Lignes en erreur" ton="text-danger" />
      </div>

      {cr.doublons.length > 0 && (
        <p className="mt-4 text-xs text-texte-attenue">
          {cr.doublons.length} doublon{cr.doublons.length > 1 ? 's' : ''} dans le fichier (même
          identité) — dernière occurrence retenue :{' '}
          {cr.doublons.map((d) => `${d.identite} (L. ${d.ligne})`).join(', ')}.
        </p>
      )}

      {cr.erreurs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-texte-fort">
            Lignes en erreur ({cr.erreurs.length})
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-texte-doux">
                  <th className="border-b border-bordure px-2 py-2 font-medium uppercase">Ligne</th>
                  <th className="border-b border-bordure px-2 py-2 font-medium uppercase">Grimpeur</th>
                  <th className="border-b border-bordure px-2 py-2 font-medium uppercase">Raison</th>
                </tr>
              </thead>
              <tbody>
                {cr.erreurs.map((e) => (
                  <tr key={e.ligne}>
                    <td className="border-b border-white/5 px-2 py-2 font-bold text-danger">
                      L. {e.ligne}
                    </td>
                    <td className="border-b border-white/5 px-2 py-2 text-texte">{e.identite}</td>
                    <td className="border-b border-white/5 px-2 py-2 text-texte-attenue">
                      {e.raison}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Carte>
  )
}

function Stat({ valeur, label, ton }: { valeur: number; label: string; ton: string }) {
  return (
    <div className="rounded-xl border border-bordure bg-surface p-3">
      <div className={`text-2xl font-extrabold ${ton}`}>{valeur}</div>
      <div className="mt-0.5 text-xs text-texte-doux">{label}</div>
    </div>
  )
}
