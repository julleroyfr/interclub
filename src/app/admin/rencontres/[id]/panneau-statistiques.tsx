import { Carte, TitreSection } from '@/composants'
import {
  avancementSaisie,
  bilanRencontre,
  clubsSansGroupe,
  effectifs,
  repartitionParGroupe,
  sectionsStatistiques,
} from '@/domaine/statistiques-rencontre'
import type { DonneesStatistiques } from '@/lib/admin/statistiques'

import { ancreClub } from './ancre-club'

// Statistiques d'une rencontre enfant (spec #3 R41e–R41j) : effectifs,
// répartition par groupe de départ et clubs avec des enfants sans groupe en
// toutes phases ; avancement de la saisie en ③ ; bilan en ④/⑤.

const titre = 'mb-3 text-xs font-bold uppercase tracking-wide text-texte-fort'
const th = 'px-1 py-1.5 text-[11px] font-bold uppercase tracking-wide text-texte-doux'
const td = 'border-t border-white/5 px-1 py-1.5'
const n = 'text-right tabular-nums'
const total = 'border-t border-bordure px-1 py-1.5 font-bold text-texte-fort'

export function PanneauStatistiques({
  donnees,
  nbBlocs,
  avecVitesse,
}: {
  donnees: DonneesStatistiques
  nbBlocs: number
  avecVitesse: boolean
}) {
  const { enfants, clubs } = donnees
  const sections = sectionsStatistiques(donnees.phase)
  const eff = effectifs(enfants, clubs)
  const repartition = repartitionParGroupe(enfants)
  const sansGroupe = clubsSansGroupe(enfants, clubs)
  const avecNonRenseigne = eff.total.nonRenseigne > 0

  return (
    <section className="flex flex-col gap-4" aria-labelledby="titre-statistiques">
      <div id="titre-statistiques">
        <TitreSection>Statistiques</TitreSection>
      </div>

      {/* R41f — effectifs */}
      <Carte className="p-4">
        <h3 className={titre}>Effectifs</h3>
        <div className="flex flex-wrap gap-5">
          <Chiffre k="Enfants" v={eff.total.total} />
          <Chiffre k="Filles" v={eff.total.filles} />
          <Chiffre k="Garçons" v={eff.total.garcons} />
          {avecNonRenseigne && <Chiffre k="Non renseigné" v={eff.total.nonRenseigne} />}
        </div>
        {eff.parClub.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Club</th>
                <th className={`${th} ${n}`}>Filles</th>
                <th className={`${th} ${n}`}>Garçons</th>
                {avecNonRenseigne && <th className={`${th} ${n}`}>N. r.</th>}
                <th className={`${th} ${n}`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {eff.parClub.map((c) => (
                <tr key={c.clubId}>
                  <td className={td}>{c.clubNom}</td>
                  <td className={`${td} ${n}`}>{c.filles}</td>
                  <td className={`${td} ${n}`}>{c.garcons}</td>
                  {avecNonRenseigne && <td className={`${td} ${n}`}>{c.nonRenseigne}</td>}
                  <td className={`${td} ${n}`}>{c.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Carte>

      {/* R41h — clubs avec des enfants sans groupe ; alerte dès la ③ */}
      {sansGroupe.length === 0 ? (
        <Carte className="p-4">
          <h3 className={titre}>Enfants sans groupe de départ</h3>
          <p className="text-sm text-secondaire">✓ Tous les enfants ont un groupe de départ.</p>
        </Carte>
      ) : (
        <Carte
          className={`p-4 ${sections.alerteSansGroupe ? 'border-attention/50 bg-attention/10' : ''}`}
          role={sections.alerteSansGroupe ? 'alert' : undefined}
        >
          <h3 className={titre}>
            {sections.alerteSansGroupe && '⚠ '}Enfants sans groupe de départ
          </h3>
          {sections.alerteSansGroupe && (
            <p className="mb-2 text-xs text-attention">
              Ces enfants ne peuvent recevoir aucun résultat de voie.
            </p>
          )}
          <ul>
            {sansGroupe.map((c) => (
              <li key={c.clubId} className="border-t border-white/5 first:border-t-0">
                <a
                  href={`#${ancreClub(c.clubId)}`}
                  className="flex min-h-11 items-center justify-between gap-3 px-1 text-sm text-texte hover:text-texte-fort"
                >
                  <span>{c.clubNom}</span>
                  <span className="font-bold text-attention">
                    {c.nombre} <span aria-hidden>→</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      {/* R41g — répartition par groupe de départ */}
      <Carte className="p-4">
        <h3 className={titre}>Répartition par groupe de départ</h3>
        <ul className="grid grid-cols-2 gap-x-5 sm:grid-cols-3">
          {repartition.groupes.map((g) => (
            <li
              key={g.groupe}
              className={`flex justify-between border-t border-white/5 py-1.5 text-sm ${g.nombre === 0 ? 'text-texte-doux' : ''}`}
            >
              <span>{g.libelle}</span>
              <span className={`tabular-nums ${g.nombre === 0 ? '' : 'font-bold text-texte-fort'}`}>
                {g.nombre}
              </span>
            </li>
          ))}
          <li className="col-span-full flex justify-between border-t border-white/5 py-1.5 text-sm font-semibold text-attention">
            <span>À définir</span>
            <span className="tabular-nums">{repartition.aDefinir}</span>
          </li>
        </ul>
      </Carte>

      {sections.avancement && (
        <Avancement donnees={donnees} nbBlocs={nbBlocs} avecVitesse={avecVitesse} />
      )}
      {sections.bilan && <Bilan donnees={donnees} avecVitesse={avecVitesse} />}
    </section>
  )
}

/** R41i — avancement de la saisie (③). */
function Avancement({
  donnees,
  nbBlocs,
  avecVitesse,
}: {
  donnees: DonneesStatistiques
  nbBlocs: number
  avecVitesse: boolean
}) {
  const r = avancementSaisie({ ...donnees, nbBlocs, avecVitesse })
  return (
    <Carte className="p-4">
      <h3 className={titre}>Avancement de la saisie</h3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Club</th>
            <th className={`${th} ${n}`}>Voies</th>
            <th className={`${th} ${n}`}>Blocs</th>
            {avecVitesse && <th className={`${th} ${n}`}>Vitesse</th>}
          </tr>
        </thead>
        <tbody>
          {r.parClub.map((c) => (
            <tr key={c.clubId}>
              <td className={td}>{c.clubNom}</td>
              <td className={`${td} ${n}`}><Ratio {...c.voies} /></td>
              <td className={`${td} ${n}`}><Ratio {...c.blocs} /></td>
              {avecVitesse && <td className={`${td} ${n}`}><Ratio {...c.vitesse} /></td>}
            </tr>
          ))}
          <tr>
            <td className={total}>Total</td>
            <td className={`${total} ${n}`}>{r.total.voies.saisis}/{r.total.voies.attendus}</td>
            <td className={`${total} ${n}`}>{r.total.blocs.saisis}/{r.total.blocs.attendus}</td>
            {avecVitesse && (
              <td className={`${total} ${n}`}>{r.total.vitesse.saisis}/{r.total.vitesse.attendus}</td>
            )}
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-texte-doux">
        Attendus : 3 voies par enfant ayant un groupe · 1 résultat par bloc
        {avecVitesse && ' · 1 vitesse par enfant'}.
      </p>
    </Carte>
  )
}

/** R41j — bilan (④/⑤). */
function Bilan({ donnees, avecVitesse }: { donnees: DonneesStatistiques; avecVitesse: boolean }) {
  const r = bilanRencontre({ ...donnees, avecVitesse })
  const lignes = [
    ...r.parClub.map((c) => ({ ...c, estTotal: false })),
    { clubId: 'total', clubNom: 'Total', ...r.total, estTotal: true },
  ]
  return (
    <Carte className="overflow-x-auto p-4">
      <h3 className={titre}>Bilan</h3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Club</th>
            <th className={`${th} ${n}`}>NP voies</th>
            <th className={`${th} ${n}`}>NP blocs</th>
            {avecVitesse && <th className={`${th} ${n}`}>NP vitesse</th>}
            {avecVitesse && <th className={`${th} ${n}`}>Vitesse non saisie</th>}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            const c = l.estTotal ? total : td
            const v = (x: number) => (
              <td className={`${c} ${n} ${x === 0 && !l.estTotal ? 'text-texte-doux' : ''}`}>{x}</td>
            )
            return (
              <tr key={l.clubId}>
                <td className={c}>{l.clubNom}</td>
                {v(l.npVoies)}
                {v(l.npBlocs)}
                {avecVitesse && v(l.npVitesse)}
                {avecVitesse && v(l.vitesseNonSaisie)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </Carte>
  )
}

function Chiffre({ k, v }: { k: string; v: number }) {
  return (
    <div>
      <div className="text-2xl font-bold text-texte-fort">{v}</div>
      <div className="text-xs uppercase tracking-wide text-texte-doux">{k}</div>
    </div>
  )
}

function Ratio({ saisis, attendus }: { saisis: number; attendus: number }) {
  const pct = attendus === 0 ? 0 : Math.round((saisis / attendus) * 100)
  return (
    <span className="inline-block min-w-14">
      {saisis}/{attendus}
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <span
          className={`block h-full ${pct >= 100 ? 'bg-secondaire' : 'bg-accent'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </span>
    </span>
  )
}
