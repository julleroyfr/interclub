'use client'

import { useActionState, useId } from 'react'

import { Bouton, Carte, ChampTexte, TitreSection } from '@/composants'
import { importerLicencies } from '@/lib/grimpeurs/import-actions'
import type { CompteRenduImport, EtatImport } from '@/lib/grimpeurs/import'

const etatInitial: EtatImport = undefined

/**
 * Formulaire d'import des licenciés (spec #13) : dépôt d'un `.xlsx` + année de
 * référence (R6), puis affichage du compte-rendu (R18).
 */
export function FormulaireImport({ anneeDefaut }: { anneeDefaut: number }) {
  const [etat, action, enCours] = useActionState(importerLicencies, etatInitial)
  const idFichier = useId()
  const idAnnee = useId()

  return (
    <div className="flex flex-col gap-6">
      <Carte className="max-w-2xl p-6">
        <TitreSection>Fichier &amp; paramètres</TitreSection>
        <form action={action} className="mt-4 flex flex-col gap-4">
          <div>
            <label
              htmlFor={idFichier}
              className="text-xs font-medium uppercase tracking-wide text-texte-attenue"
            >
              Fichier des licenciés (.xlsx)
            </label>
            <input
              id={idFichier}
              name="fichier"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              className="mt-1 block w-full rounded-xl border border-bordure bg-black/30 px-4 py-3 text-base text-texte-fort file:mr-4 file:rounded-lg file:border-0 file:bg-admin/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-admin hover:file:bg-admin/30 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <p className="mt-1 text-xs text-texte-doux">
              Export FFME : 1<sup>re</sup> feuille, colonnes Nom, Prénom, Date de naissance,
              Sexe, N° de licence, Nom de la structure.
            </p>
          </div>

          <ChampTexte
            id={idAnnee}
            name="annee"
            type="number"
            inputMode="numeric"
            label="Année de référence (filtre d’âge)"
            defaultValue={anneeDefaut}
            min={1900}
            max={2100}
            indice={`On n’importe que les licenciés de 18 ans au plus à cette année (nés en ${anneeDefaut - 18} ou après).`}
          />

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

function CompteRendu({ cr }: { cr: CompteRenduImport }) {
  return (
    <Carte className="max-w-2xl p-6">
      <TitreSection>Compte-rendu de l’import</TitreSection>
      <p className="mt-1 text-sm text-secondaire">
        ✅ Import terminé — année de référence <strong>{cr.anneeReference}</strong> · seuil de
        naissance <strong>{cr.seuilAnneeNaissance}</strong> · {cr.totalLignes} ligne
        {cr.totalLignes > 1 ? 's' : ''} traitée{cr.totalLignes > 1 ? 's' : ''}.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat valeur={cr.crees} label="Créés" ton="text-secondaire" />
        <Stat valeur={cr.misAJour} label="Mis à jour" ton="text-accent" />
        <Stat valeur={cr.ignoresHorsAge} label="Ignorés (hors âge)" ton="text-texte-attenue" />
        <Stat valeur={cr.erreurs.length} label="Lignes en erreur" ton="text-danger" />
      </div>

      {cr.clubsCrees.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-texte-fort">
            Clubs créés automatiquement ({cr.clubsCrees.length})
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {cr.clubsCrees.map((nom) => (
              <span
                key={nom}
                className="rounded-full border border-admin/30 bg-admin/10 px-3 py-1 text-xs text-admin"
              >
                {nom}
              </span>
            ))}
          </div>
        </div>
      )}

      {cr.doublons.length > 0 && (
        <p className="mt-4 text-xs text-texte-attenue">
          {cr.doublons.length} doublon{cr.doublons.length > 1 ? 's' : ''} de licence dans le
          fichier — dernière occurrence retenue (R14).
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
                  <th className="border-b border-bordure px-2 py-2 font-medium uppercase">Licencié</th>
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
