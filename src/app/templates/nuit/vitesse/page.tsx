import {
  Bouton,
  Carte,
  ChampTexte,
  EnTetePage,
  Etiquette,
} from '@/composants'

import { formaterTemps, libelleResultat, vitesse } from '../../_data'

export default function VitesseNuit() {
  return (
    <div className="mx-auto max-w-3xl">
      <EnTetePage
        titre={
          <>
            <span className="text-accent-doux">⚡</span> {vitesse.epreuve}
          </>
        }
        sousTitre={vitesse.rencontre}
      />
      <p className="mt-1 text-sm text-texte-doux">{vitesse.juge}</p>

      <div className="mt-6 space-y-3">
        {vitesse.grimpeurs.map((g) => (
          <Carte key={g.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-texte-fort">{g.nom}</p>
                <p className="text-xs text-texte-doux">{g.club}</p>
              </div>
              {g.resultat === 'temps' ? (
                <span className="font-mono text-2xl font-bold text-secondaire">
                  {formaterTemps(g.centiemes)}
                </span>
              ) : g.resultat ? (
                <Etiquette variante="neutre">
                  {libelleResultat(g.resultat)}
                </Etiquette>
              ) : (
                <span className="text-xs text-texte-doux">à saisir</span>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <ChampTexte
                id={`${g.id}-temps`}
                label="Temps chronométré"
                inputMode="numeric"
                defaultValue={
                  g.resultat === 'temps' ? formaterTemps(g.centiemes) : ''
                }
                placeholder="8″12"
                className="flex-1"
              />
              <div className="grid grid-cols-2 gap-2">
                <Bouton variante="danger">Chute</Bouton>
                <Bouton variante="secondaire">Absent</Bouton>
              </div>
            </div>
          </Carte>
        ))}
      </div>

      <p className="mt-4 rounded-xl border border-bordure bg-surface px-4 py-3 text-sm text-texte-attenue">
        Un grimpeur a un seul résultat par rencontre : temps chronométré, chute
        ou non-présentation.
      </p>
    </div>
  )
}
