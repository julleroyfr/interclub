import {
  Bouton,
  Carte,
  ChampTexte,
  EnTetePage,
  Pastille,
  type VariantePastille,
} from '@/composants'

import { equipe } from '../../_data'

const etat: Record<string, { pastille: VariantePastille; libelle: string }> = {
  saisi: { pastille: 'succes', libelle: 'Complet' },
  partiel: { pastille: 'attention', libelle: 'Partiel' },
  vide: { pastille: 'neutre', libelle: 'À saisir' },
}

export default function EquipeNuit() {
  return (
    <div className="mx-auto max-w-3xl">
      <EnTetePage titre={equipe.nom} sousTitre={equipe.rencontre} />
      <p className="mt-1 text-sm text-texte-doux">{equipe.club}</p>

      <div className="mt-6 space-y-3">
        {equipe.grimpeurs.map((g) => {
          const e = etat[g.statut]
          return (
            <Carte key={g.id} className="p-4">
              <div className="flex items-center gap-2">
                <Pastille variante={e.pastille} libelle={e.libelle} />
                <p className="font-semibold text-texte-fort">{g.nom}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <ChampTexte
                  id={`${g.id}-voie`}
                  label="Voie"
                  tonLabel="accent"
                  type="number"
                  inputMode="numeric"
                  defaultValue={g.voie ?? ''}
                  placeholder="pts"
                />
                <ChampTexte
                  id={`${g.id}-bloc`}
                  label="Bloc"
                  tonLabel="secondaire"
                  type="number"
                  inputMode="numeric"
                  defaultValue={g.bloc ?? ''}
                  placeholder="tops"
                />
              </div>
            </Carte>
          )
        })}
      </div>

      <div className="mt-6 flex gap-3">
        <Bouton variante="secondaire" pleineLargeur>
          Brouillon
        </Bouton>
        <Bouton variante="primaire" pleineLargeur>
          Valider l&apos;équipe
        </Bouton>
      </div>
    </div>
  )
}
