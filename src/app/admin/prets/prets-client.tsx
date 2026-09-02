'use client'

import { useActionState, useId } from 'react'

import { Bouton, ChampSelect } from '@/composants'
import { creerPretAction, revoquerPretAction } from '@/lib/prets/prets-actions'
import type {
  ClubOption,
  EtatPret,
  GrimpeurOption,
  RencontreOption,
} from '@/lib/prets/prets'

const etatInitial: EtatPret = undefined

/** Formulaire de création d'un prêt (admin, R35). */
export function FormulairePret({
  rencontres,
  grimpeurs,
  clubs,
}: {
  rencontres: RencontreOption[]
  grimpeurs: GrimpeurOption[]
  clubs: ClubOption[]
}) {
  const [etat, action, enCours] = useActionState(creerPretAction, etatInitial)
  const idRenc = useId()
  const idGrimpeur = useId()
  const idClub = useId()

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <ChampSelect
        id={idRenc}
        name="rencontreId"
        label="Rencontre"
        required
        placeholder="Sélectionnez une rencontre…"
        options={rencontres.map((r) => ({ value: r.id, label: r.label }))}
      />
      <ChampSelect
        id={idGrimpeur}
        name="grimpeurId"
        label="Grimpeur à prêter"
        required
        placeholder="Sélectionnez un grimpeur…"
        options={grimpeurs.map((g) => ({ value: g.id, label: g.label }))}
      />
      <ChampSelect
        id={idClub}
        name="clubAccueilId"
        label="Club d'accueil"
        required
        placeholder="Sélectionnez le club d'accueil…"
        options={clubs.map((c) => ({ value: c.id, label: c.nom }))}
      />

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

      <Bouton type="submit" disabled={enCours} pleineLargeur>
        {enCours ? 'Création…' : 'Créer le prêt'}
      </Bouton>
    </form>
  )
}

/** Bouton de révocation d'un prêt (admin, R35). */
export function BoutonRevoquerPret({
  rencontreId,
  grimpeurId,
}: {
  rencontreId: string
  grimpeurId: string
}) {
  const [etat, action, enCours] = useActionState(revoquerPretAction, etatInitial)
  return (
    <form action={action}>
      <input type="hidden" name="rencontreId" value={rencontreId} />
      <input type="hidden" name="grimpeurId" value={grimpeurId} />
      <Bouton type="submit" variante="danger" taille="sm" disabled={enCours}>
        {enCours ? 'Révocation…' : 'Révoquer'}
      </Bouton>
      {etat?.erreur && (
        <span role="alert" className="ml-2 text-xs text-danger">
          {etat.erreur}
        </span>
      )}
    </form>
  )
}
