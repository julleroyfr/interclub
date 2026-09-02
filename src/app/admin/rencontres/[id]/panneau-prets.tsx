'use client'

import { useActionState, useId, useState } from 'react'

import {
  Bouton,
  Carte,
  Cellule,
  CelluleTete,
  ChampSelect,
  ChampTexte,
  CorpsTableau,
  LigneTableau,
  Tableau,
  TeteTableau,
  TitreSection,
} from '@/composants'
import { creerPretAction, revoquerPretAction } from '@/lib/prets/prets-actions'
import type {
  ClubOption,
  EtatPret,
  GrimpeurOption,
  PretExistant,
} from '@/lib/prets/prets'

const etatInitial: EtatPret = undefined

/**
 * Panneau de gestion des prêts d'UNE rencontre (spec #1 R35). La rencontre est
 * implicite (contexte de la page) : le formulaire ne demande que le grimpeur et
 * le club d'accueil. Une fois le prêt créé, le coach d'accueil voit le grimpeur
 * dans son roster (spec #5 R12/R13).
 */
export function PanneauPrets({
  rencontreId,
  grimpeurs,
  clubs,
  prets,
}: {
  rencontreId: string
  grimpeurs: GrimpeurOption[]
  clubs: ClubOption[]
  prets: PretExistant[]
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <TitreSection>Prêts de grimpeurs</TitreSection>
        <p className="text-xs text-texte-attenue">
          Mettez un grimpeur d’un autre club à disposition d’un club d’accueil pour
          cette rencontre (R35).
        </p>
      </div>

      <Carte className="max-w-xl p-6">
        <FormulairePret
          rencontreId={rencontreId}
          grimpeurs={grimpeurs}
          clubs={clubs}
        />
      </Carte>

      {prets.length === 0 ? (
        <p className="text-sm text-texte-attenue">Aucun prêt pour cette rencontre.</p>
      ) : (
        <Tableau>
          <TeteTableau>
            <tr>
              <CelluleTete>Grimpeur</CelluleTete>
              <CelluleTete>Club d’origine</CelluleTete>
              <CelluleTete>Club d’accueil</CelluleTete>
              <CelluleTete>Action</CelluleTete>
            </tr>
          </TeteTableau>
          <CorpsTableau>
            {prets.map((p) => (
              <LigneTableau key={p.grimpeurId}>
                <Cellule>{p.grimpeurNom}</Cellule>
                <Cellule>{p.clubOrigineNom}</Cellule>
                <Cellule>{p.clubAccueilNom}</Cellule>
                <Cellule>
                  <BoutonRevoquerPret
                    rencontreId={p.rencontreId}
                    grimpeurId={p.grimpeurId}
                  />
                </Cellule>
              </LigneTableau>
            ))}
          </CorpsTableau>
        </Tableau>
      )}
    </section>
  )
}

function FormulairePret({
  rencontreId,
  grimpeurs,
  clubs,
}: {
  rencontreId: string
  grimpeurs: GrimpeurOption[]
  clubs: ClubOption[]
}) {
  const [etat, action, enCours] = useActionState(creerPretAction, etatInitial)
  // On choisit d'abord le CLUB D'ORIGINE (potentiellement des centaines de
  // grimpeurs) puis on filtre par une recherche textuelle sur le nom.
  const [clubOrigine, setClubOrigine] = useState('')
  const [recherche, setRecherche] = useState('')
  const idClubOrigine = useId()
  const idRecherche = useId()
  const idGrimpeur = useId()
  const idClub = useId()

  const q = recherche.trim().toLowerCase()
  const grimpeursFiltres = grimpeurs.filter(
    (g) => g.clubId === clubOrigine && (q === '' || g.nom.toLowerCase().includes(q)),
  )
  const clubsAccueil = clubs.filter((c) => c.id !== clubOrigine)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="rencontreId" value={rencontreId} />

      <ChampSelect
        id={idClubOrigine}
        label="Club du grimpeur"
        required
        placeholder="Sélectionnez le club d'origine…"
        options={clubs.map((c) => ({ value: c.id, label: c.nom }))}
        onChange={(e) => {
          setClubOrigine(e.target.value)
          setRecherche('')
        }}
      />

      {clubOrigine && (
        <>
          <ChampTexte
            // `key` : on repart d'une recherche vide à chaque changement de club.
            key={clubOrigine}
            id={idRecherche}
            label="Rechercher un grimpeur"
            type="search"
            placeholder="Nom ou prénom…"
            autoComplete="off"
            onChange={(e) => setRecherche(e.target.value)}
          />
          <ChampSelect
            id={idGrimpeur}
            name="grimpeurId"
            label={`Grimpeur à prêter (${grimpeursFiltres.length})`}
            required
            placeholder={
              grimpeursFiltres.length
                ? 'Sélectionnez un grimpeur…'
                : 'Aucun grimpeur pour ce filtre'
            }
            options={grimpeursFiltres.map((g) => ({ value: g.id, label: g.nom }))}
          />
        </>
      )}

      <ChampSelect
        id={idClub}
        name="clubAccueilId"
        label="Club d'accueil"
        required
        placeholder="Sélectionnez le club d'accueil…"
        options={clubsAccueil.map((c) => ({ value: c.id, label: c.nom }))}
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

function BoutonRevoquerPret({
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
