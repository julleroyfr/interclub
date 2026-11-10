'use client'

import { useActionState, useId } from 'react'

import { Bouton, ChampSelect } from '@/composants'
import type { EtatGrimpeur } from '@/lib/grimpeurs/grimpeurs'
import type { EtatSurclassementGrimpeur } from '@/lib/grimpeurs/surclassement'
import { accorderSurclassement, revoquerSurclassement } from '@/lib/grimpeurs/surclassement-actions'

// Surclassement d'un grimpeur sur l'écran Grimpeurs (spec #21 R18–R19) : badge,
// actions Surclasser / Révoquer avec confirmation (R15) et historique.

const etatInitial: EtatGrimpeur = undefined

/** Badges « Surclassé ado <saison> », un par surclassement actif (R18). */
export function BadgesSurclassement({ etat }: { etat: EtatSurclassementGrimpeur }) {
  return etat.actifs.map((a) => (
    <span
      key={a.saison}
      className="ml-2 inline-flex items-center rounded-full border border-surclasse/40 bg-surclasse/10 px-2 py-0.5 align-middle text-[10px] font-bold text-surclasse"
    >
      Surclassé ado {a.libelleSaison}
    </span>
  ))
}

/** Panneau ouvert sous la ligne : accord, révocation d'une saison, ou aucun. */
export type PanneauSurclassement = { type: 'accorder' } | { type: 'revoquer'; saison: number } | null

/** Boutons Surclasser / Révoquer, dans la rangée d'actions de la ligne (R18). */
export function BoutonsSurclassement({
  etat,
  panneau,
  setPanneau,
}: {
  etat: EtatSurclassementGrimpeur
  panneau: PanneauSurclassement
  setPanneau: (p: PanneauSurclassement) => void
}) {
  const plusieursActifs = etat.actifs.length > 1
  return (
    <>
      {etat.saisonsAccordables.length > 0 && (
        <Bouton
          variante="secondaire"
          aria-expanded={panneau?.type === 'accorder'}
          onClick={() => setPanneau(panneau?.type === 'accorder' ? null : { type: 'accorder' })}
        >
          Surclasser
        </Bouton>
      )}
      {etat.actifs.map((a) => (
        <Bouton
          key={a.saison}
          variante="secondaire"
          aria-expanded={panneau?.type === 'revoquer' && panneau.saison === a.saison}
          onClick={() => setPanneau({ type: 'revoquer', saison: a.saison })}
        >
          Révoquer le surclassement{plusieursActifs ? ` ${a.libelleSaison}` : ''}
        </Bouton>
      ))}
    </>
  )
}

/** Panneaux d'accord / révocation (R15), messages et historique (R19). */
export function PanneauxSurclassement({
  grimpeurId,
  prenom,
  etat,
  panneau,
  setPanneau,
}: {
  grimpeurId: string
  prenom: string
  etat: EtatSurclassementGrimpeur
  panneau: PanneauSurclassement
  setPanneau: (p: PanneauSurclassement) => void
}) {
  // Le panneau se referme sur un succès ; le message reste affiché.
  const [etatAcc, actionAcc, accEnCours] = useActionState(
    async (prec: EtatGrimpeur, fd: FormData) => {
      const r = await accorderSurclassement(prec, fd)
      if (r?.succes) setPanneau(null)
      return r
    },
    etatInitial,
  )
  const [etatRev, actionRev, revEnCours] = useActionState(
    async (prec: EtatGrimpeur, fd: FormData) => {
      const r = await revoquerSurclassement(prec, fd)
      if (r?.succes) setPanneau(null)
      return r
    },
    etatInitial,
  )
  const idSaison = useId()
  const actifRevoque =
    panneau?.type === 'revoquer' ? etat.actifs.find((a) => a.saison === panneau.saison) : undefined
  const message = etatRev ?? etatAcc
  const vide = !panneau && !message && etat.historique.length === 0
  if (vide) return null

  return (
    <div className="mt-3 flex flex-col gap-3">
      {panneau?.type === 'accorder' && (
        <form action={actionAcc} className="flex flex-col gap-3 border-t border-bordure pt-3">
          <p className="text-sm font-semibold text-texte-fort">Surclasser en ado</p>
          <input type="hidden" name="grimpeurId" value={grimpeurId} />
          <div className="max-w-xs">
            <ChampSelect
              id={idSaison}
              name="saison"
              label="Saison"
              options={etat.saisonsAccordables.map((s, i) => ({
                value: String(s.saison),
                label: `${s.libelle}${i === 0 && etat.saisonsAccordables.length > 1 ? ' (saison courante)' : ''}`,
              }))}
              defaultValue={String(etat.saisonsAccordables[0]!.saison)}
              required
            />
          </div>
          <p className="text-xs text-texte-doux">
            {prenom} restera éligible enfant et pourra aussi être engagé(e) dans les rencontres ado
            de cette saison. Le surclassement ne se reporte pas sur la saison suivante.
          </p>
          <div className="flex flex-wrap gap-2">
            <Bouton type="submit" disabled={accEnCours}>
              {accEnCours ? 'Enregistrement…' : 'Confirmer le surclassement'}
            </Bouton>
            <Bouton variante="fantome" onClick={() => setPanneau(null)}>
              Annuler
            </Bouton>
          </div>
        </form>
      )}

      {actifRevoque && (
        <form action={actionRev} className="flex flex-col gap-3 border-t border-bordure pt-3">
          <p className="text-sm font-semibold text-texte-fort">
            Révoquer le surclassement {actifRevoque.libelleSaison} ?
          </p>
          <input type="hidden" name="grimpeurId" value={grimpeurId} />
          <input type="hidden" name="saison" value={actifRevoque.saison} />
          {/* Rencontres ado à venir dont le grimpeur sera retiré (R12, R15). */}
          {actifRevoque.retraits.length === 0 ? (
            <p className="text-sm text-texte-attenue">Aucun engagement ado à venir.</p>
          ) : (
            <div className="rounded-xl border border-attention/30 bg-attention/10 px-3 py-2 text-sm text-attention">
              {prenom} sera retiré(e) de ces rencontres ado à venir :
              <ul className="mt-1 list-disc pl-5 text-texte">
                {actifRevoque.retraits.map((r) => (
                  <li key={`${r.rencontreId}:${r.nature}`}>
                    {formaterDate(r.dateRencontre)} — {r.clubPorteurNom},{' '}
                    {r.nature === 'pret' ? 'prêt supprimé' : `équipe « ${r.equipeNom ?? '?'} »`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-texte-doux">
            Les rencontres déjà commencées ne changent pas : ses résultats et ses points restent dans
            les classements.
          </p>
          <div className="flex flex-wrap gap-2">
            <Bouton type="submit" variante="danger" disabled={revEnCours}>
              {revEnCours ? 'Révocation…' : 'Oui, révoquer'}
            </Bouton>
            <Bouton variante="fantome" onClick={() => setPanneau(null)}>
              Non
            </Bouton>
          </div>
        </form>
      )}

      {message?.erreur && (
        <p role="alert" className="text-sm text-danger">
          {message.erreur}
        </p>
      )}
      {message?.succes && (
        <p role="status" className="text-sm text-secondaire">
          {message.succes}
        </p>
      )}

      {etat.historique.length > 0 && (
        <details>
          <summary className="flex min-h-8 cursor-pointer items-center text-xs text-texte-attenue">
            Historique des surclassements ({etat.historique.length})
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-texte-doux">
                <tr>
                  <th className="px-2 py-1 font-semibold">Saison</th>
                  <th className="px-2 py-1 font-semibold">Accordé le</th>
                  <th className="px-2 py-1 font-semibold">Révoqué le</th>
                </tr>
              </thead>
              <tbody>
                {etat.historique.map((h) => (
                  <tr key={h.accordeLe} className="border-t border-white/5">
                    <td className="px-2 py-1">{h.libelleSaison}</td>
                    <td className="px-2 py-1">{formaterDate(h.accordeLe)}</td>
                    <td className={`px-2 py-1 ${h.revoqueLe ? '' : 'font-semibold text-secondaire'}`}>
                      {h.revoqueLe ? formaterDate(h.revoqueLe) : 'Actif'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

/** Date ISO (date `AAAA-MM-JJ` ou horodatage) → « JJ/MM/AAAA », heure de Paris. */
function formaterDate(iso: string): string {
  if (iso.length === 10) {
    const [a, m, j] = iso.split('-')
    return `${j}/${m}/${a}`
  }
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
}
