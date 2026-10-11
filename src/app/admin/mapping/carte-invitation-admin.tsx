'use client'

import { useEffect, useState } from 'react'

import { Bouton, Etiquette, TitreSection } from '@/composants'
import type { VarianteEtiquette } from '@/composants'
import {
  formaterTempsRestant,
  secondesRestantes,
  type EtatInvitationAdmin,
} from '@/domaine/invitation-admin'
import { genererInvitationAdmin, revoquerInvitationAdmin } from '@/lib/invitations/actions-admin'
import type { InvitationAdminVue } from '@/lib/invitations/invitations-admin'

const LIBELLE_ETAT: Record<EtatInvitationAdmin, string> = {
  valable: 'Valable',
  utilisee: 'Utilisée',
  expiree: 'Expirée',
  revoquee: 'Révoquée',
}

const VARIANTE_ETAT: Record<EtatInvitationAdmin, VarianteEtiquette> = {
  valable: 'succes',
  utilisee: 'accent',
  expiree: 'attention',
  revoquee: 'neutre',
}

/**
 * Invitation administrateur (spec #2 R35–R40) : état de la dernière invitation,
 * QR + URL et temps restant tant qu'elle est valable, génération d'une nouvelle
 * (qui invalide la précédente, R37) et révocation.
 */
export function CarteInvitationAdmin({ invitation }: { invitation: InvitationAdminVue | null }) {
  const restant = useSecondesRestantes(invitation)
  // Le décompte arrivé à zéro rend l'invitation expirée sans recharger l'écran (R36).
  const etat: EtatInvitationAdmin | null =
    invitation?.etat === 'valable' && restant === 0 ? 'expiree' : (invitation?.etat ?? null)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <TitreSection>Inviter un administrateur</TitreSection>
        <p className="mt-1 text-sm text-texte-attenue">
          QR à usage unique, valable 15 minutes : la personne qui le scanne crée son
          compte administrateur.
        </p>
      </div>

      {invitation && etat && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-texte-attenue">Dernière invitation :</span>
          <Etiquette variante={VARIANTE_ETAT[etat]}>{LIBELLE_ETAT[etat]}</Etiquette>
          {etat === 'valable' && restant !== null && (
            <span className="text-texte">
              expire dans <strong>{formaterTempsRestant(restant)}</strong>
            </span>
          )}
        </p>
      )}

      {invitation && etat === 'valable' && invitation.qrDataUrl && invitation.url && (
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={invitation.qrDataUrl}
            alt="QR de l'invitation administrateur"
            width={200}
            height={200}
            className="rounded-xl bg-white p-2"
          />
          <code className="break-all text-center text-xs text-texte-doux">{invitation.url}</code>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={genererInvitationAdmin}>
          <Bouton type="submit">
            {etat === 'valable' ? 'Régénérer l’invitation' : 'Générer une invitation'}
          </Bouton>
        </form>
        {invitation && etat === 'valable' && (
          <form action={revoquerInvitationAdmin}>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <Bouton type="submit" variante="danger">
              Révoquer
            </Bouton>
          </form>
        )}
      </div>
    </div>
  )
}

/**
 * Secondes restantes avant l'expiration, recalées sur l'horloge du serveur et
 * mises à jour chaque seconde ; `null` si l'invitation n'est pas valable.
 */
function useSecondesRestantes(invitation: InvitationAdminVue | null): number | null {
  const valable = invitation?.etat === 'valable'
  const expireLe = invitation?.expireLe
  const heureServeur = invitation?.heureServeur

  const calculer = () => {
    if (!valable || !expireLe || !heureServeur) return null
    // Écart navigateur ↔ serveur, figé au chargement : le décompte ne dépend pas
    // de la justesse de l'horloge du navigateur.
    const ecart = Date.now() - new Date(heureServeur).getTime()
    return secondesRestantes(new Date(expireLe), new Date(Date.now() - ecart))
  }

  const [restant, setRestant] = useState<number | null>(calculer)

  useEffect(() => {
    if (!valable || !expireLe || !heureServeur) return
    const ecart = Date.now() - new Date(heureServeur).getTime()
    const tic = () => setRestant(secondesRestantes(new Date(expireLe), new Date(Date.now() - ecart)))
    tic()
    const minuterie = setInterval(tic, 1000)
    return () => clearInterval(minuterie)
  }, [valable, expireLe, heureServeur])

  return valable ? restant : null
}
