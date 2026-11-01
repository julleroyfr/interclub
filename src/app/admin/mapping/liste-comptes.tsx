'use client'

import { useActionState, useEffect, useRef, useState } from 'react'

import {
  Bouton,
  Cellule,
  CelluleTete,
  CorpsTableau,
  Etiquette,
  LigneTableau,
  Tableau,
  TeteTableau,
} from '@/composants'
import type { CompteListe, EtatMapping } from '@/lib/auth/mapping'
import { supprimerCompte } from '@/lib/auth/mapping-actions'

const etatInitial: EtatMapping = undefined

type Props = {
  comptes: CompteListe[]
  /** Compte de l'admin connecté : non supprimable (spec #2 R41). */
  utilisateurCourantId: string
}

/**
 * Comptes permanents (avec ou sans rôle) et action « Supprimer » (spec #2
 * R41–R46). La suppression est définitive : elle passe par une confirmation qui
 * rappelle l'e-mail du compte visé (R42).
 */
export function ListeComptes({ comptes, utilisateurCourantId }: Props) {
  const [cible, setCible] = useState<CompteListe | null>(null)
  // Une fois la suppression traitée (succès ou refus), on referme la confirmation.
  const [etat, action, enCours] = useActionState(
    async (precedent: EtatMapping, formData: FormData) => {
      const resultat = await supprimerCompte(precedent, formData)
      setCible(null)
      return resultat
    },
    etatInitial,
  )
  const dialogue = useRef<HTMLDialogElement>(null)

  // Synchronise le `<dialog>` natif (modal, focus piégé, Échap) avec la cible.
  useEffect(() => {
    if (cible) dialogue.current?.showModal()
    else dialogue.current?.close()
  }, [cible])

  return (
    <>
      {etat?.erreur && (
        <p role="alert" className="text-sm text-danger">
          {etat.erreur}
        </p>
      )}
      {etat?.succes && (
        <p role="status" className="text-sm text-secondaire">
          {etat.succes}
        </p>
      )}

      {comptes.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucun compte permanent.</p>
      ) : (
        <Tableau>
          <TeteTableau>
            <tr>
              <CelluleTete>Compte</CelluleTete>
              <CelluleTete>Rôle</CelluleTete>
              <CelluleTete>Club</CelluleTete>
              <CelluleTete>
                <span className="sr-only">Actions</span>
              </CelluleTete>
            </tr>
          </TeteTableau>
          <CorpsTableau>
            {comptes.map((c) => {
              const estMoi = c.utilisateurId === utilisateurCourantId
              return (
                <LigneTableau key={c.utilisateurId}>
                  <Cellule className="break-all">{c.email ?? c.utilisateurId}</Cellule>
                  <Cellule>
                    {c.role ? (
                      <Etiquette variante={c.role === 'admin' ? 'accent' : 'succes'}>
                        {c.role}
                      </Etiquette>
                    ) : (
                      <Etiquette variante="neutre">sans rôle</Etiquette>
                    )}
                  </Cellule>
                  <Cellule>{c.clubNom ?? '—'}</Cellule>
                  <Cellule className="text-right">
                    {estMoi ? (
                      <span className="text-xs italic text-texte-doux">(vous)</span>
                    ) : (
                      <Bouton
                        variante="danger"
                        onClick={() => setCible(c)}
                        aria-label={`Supprimer le compte ${c.email ?? c.utilisateurId}`}
                      >
                        Supprimer
                      </Bouton>
                    )}
                  </Cellule>
                </LigneTableau>
              )
            })}
          </CorpsTableau>
        </Tableau>
      )}

      <dialog
        ref={dialogue}
        onClose={() => setCible(null)}
        aria-labelledby="titre-suppression-compte"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-bordure bg-fond p-6 text-texte backdrop:bg-black/70"
      >
        {cible && (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="utilisateurId" value={cible.utilisateurId} />
            <h2 id="titre-suppression-compte" className="text-lg font-semibold text-texte-fort">
              Supprimer ce compte ?
            </h2>
            <p className="text-sm">
              <strong className="break-all text-texte-fort">
                {cible.email ?? cible.utilisateurId}
              </strong>{' '}
              ne pourra plus se connecter.
            </p>
            <p className="text-xs text-texte-attenue">
              Suppression définitive. Les résultats saisis par ce compte sont
              conservés, sans auteur.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row-reverse">
              <Bouton type="submit" variante="danger" disabled={enCours} pleineLargeur>
                {enCours ? 'Suppression…' : 'Supprimer définitivement'}
              </Bouton>
              <Bouton
                variante="secondaire"
                onClick={() => setCible(null)}
                disabled={enCours}
                pleineLargeur
              >
                Annuler
              </Bouton>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
