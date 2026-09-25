'use client'

import { useActionState, useId, useState } from 'react'

import { Bouton, ChampTexte } from '@/composants'
import { renommerClub, supprimerClub } from '@/lib/clubs/actions'
import type { ClubAvecDependances, EtatClub } from '@/lib/clubs/clubs'
import {
  genererInvitation,
  regenererInvitation,
  revoquerInvitation,
} from '@/lib/invitations/actions'
import type { InvitationVue } from '@/lib/invitations/invitations'

const etatInitial: EtatClub = undefined

const CHEMIN = '/admin/clubs'

/** Liste des clubs avec renommage inline, suppression et invitation (admin). */
export function ListeClubs({
  clubs,
  invitations,
}: {
  clubs: ClubAvecDependances[]
  invitations: Record<string, InvitationVue>
}) {
  if (clubs.length === 0) {
    return (
      <p className="text-sm text-texte-attenue">Aucun club pour l’instant.</p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {clubs.map((club) => (
        // La clé inclut le nom : après un renommage (revalidation), la ligne se
        // remonte à neuf — l'éditeur inline se referme sans effet de bord.
        <li key={`${club.id}:${club.nom}`}>
          <LigneClub club={club} invitation={invitations[club.id] ?? null} />
        </li>
      ))}
    </ul>
  )
}

function LigneClub({
  club,
  invitation,
}: {
  club: ClubAvecDependances
  invitation: InvitationVue | null
}) {
  const [edition, setEdition] = useState(false)
  const [confirmSuppr, setConfirmSuppr] = useState(false)
  const [ouvertQR, setOuvertQR] = useState(false)
  const [etatRenom, actionRenom, renomEnCours] = useActionState(
    renommerClub,
    etatInitial,
  )
  const [etatSuppr, actionSuppr, supprEnCours] = useActionState(
    supprimerClub,
    etatInitial,
  )
  const idNom = useId()
  const supprimable = club.nbRencontres === 0 && club.nbGrimpeurs === 0

  return (
    <div className="rounded-2xl border border-bordure bg-black/20 p-4">
      {edition ? (
        <form action={actionRenom} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={club.id} />
          <ChampTexte
            id={idNom}
            name="nom"
            label="Nom du club"
            defaultValue={club.nom}
            required
            maxLength={100}
            autoComplete="off"
            erreur={etatRenom?.erreur}
          />
          <div className="flex flex-wrap gap-2">
            <Bouton type="submit" disabled={renomEnCours}>
              {renomEnCours ? 'Enregistrement…' : 'Enregistrer'}
            </Bouton>
            <Bouton variante="fantome" onClick={() => setEdition(false)}>
              Annuler
            </Bouton>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-texte-fort">
                {club.nom}
              </p>
              <p className="mt-1 text-xs text-texte-doux">
                {club.nbRencontres} rencontre(s) · {club.nbGrimpeurs} grimpeur(s)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {invitation ? (
                <button
                  type="button"
                  onClick={() => setOuvertQR((v) => !v)}
                  aria-expanded={ouvertQR}
                  aria-label={
                    ouvertQR
                      ? 'Masquer le QR de l’invitation coach'
                      : 'Afficher le QR de l’invitation coach'
                  }
                  title="Invitation coach — QR"
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${
                    ouvertQR
                      ? 'border-accent/50 bg-accent/15 text-accent'
                      : 'border-bordure text-texte-attenue hover:bg-white/5'
                  }`}
                >
                  <IconeQR />
                </button>
              ) : (
                <form action={genererInvitation}>
                  <input type="hidden" name="chemin" value={CHEMIN} />
                  <input type="hidden" name="clubId" value={club.id} />
                  <Bouton type="submit" variante="secondaire">
                    Générer l’invitation coach
                  </Bouton>
                </form>
              )}

              <Bouton variante="fantome" onClick={() => setEdition(true)}>
                Renommer
              </Bouton>

              {confirmSuppr ? (
                <form action={actionSuppr} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={club.id} />
                  <span className="text-xs text-texte-attenue">Confirmer ?</span>
                  <Bouton type="submit" variante="danger" disabled={supprEnCours}>
                    {supprEnCours ? 'Suppression…' : 'Oui, supprimer'}
                  </Bouton>
                  <Bouton variante="fantome" onClick={() => setConfirmSuppr(false)}>
                    Non
                  </Bouton>
                </form>
              ) : (
                <Bouton
                  variante="danger"
                  onClick={() => setConfirmSuppr(true)}
                  disabled={!supprimable}
                  title={
                    supprimable
                      ? undefined
                      : 'Club référencé (rencontres/grimpeurs) : suppression impossible'
                  }
                >
                  Supprimer
                </Bouton>
              )}
            </div>
          </div>

          {invitation && ouvertQR && <ZoneInvitation invitation={invitation} />}
        </div>
      )}

      {etatSuppr?.erreur && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {etatSuppr.erreur}
        </p>
      )}
      {etatRenom?.succes && (
        <p role="status" className="mt-2 text-sm text-secondaire">
          {etatRenom.succes}
        </p>
      )}
    </div>
  )
}

/**
 * Zone dépliée de l'invitation coach permanent (spec #5) : QR + lien, puis les
 * boutons Régénérer / Révoquer **sous** le QR. Les actions sont des Server
 * Actions (formulaires).
 */
function ZoneInvitation({ invitation }: { invitation: InvitationVue }) {
  return (
    <div className="flex flex-col items-center gap-3 border-t border-bordure pt-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={invitation.qrDataUrl}
        alt="QR de l'invitation coach du club"
        width={200}
        height={200}
        className="rounded-xl bg-white p-2"
      />
      <code className="break-all text-center text-xs text-texte-doux">
        {invitation.url}
      </code>
      <div className="flex flex-wrap justify-center gap-2">
        <form action={regenererInvitation}>
          <input type="hidden" name="chemin" value={CHEMIN} />
          <input type="hidden" name="invitationId" value={invitation.id} />
          <Bouton type="submit" variante="secondaire">
            Régénérer l’invitation
          </Bouton>
        </form>
        <form action={revoquerInvitation}>
          <input type="hidden" name="chemin" value={CHEMIN} />
          <input type="hidden" name="invitationId" value={invitation.id} />
          <Bouton type="submit" variante="danger">
            Révoquer
          </Bouton>
        </form>
      </div>
    </div>
  )
}

/** Icône QR Code (décorative, `aria-hidden` — le bouton porte le libellé). */
function IconeQR() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h2v2h-2v-2zm4 0h2v2h-2v-2zm2 2h2v2h-2v-2zm-6 2h2v2h-2v-2zm2 2h2v2h-2v-2zm2 0h2v2h-2v-2z" />
    </svg>
  )
}
