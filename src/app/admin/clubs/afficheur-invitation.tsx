import { Bouton, Carte } from '@/composants'
import {
  genererInvitation,
  regenererInvitation,
  revoquerInvitation,
} from '@/lib/invitations/actions'
import type { InvitationVue } from '@/lib/invitations/invitations'

type Props = {
  titre: string
  clubId: string
  chemin: string
  /** Invitation active de ce club, ou `null` s'il n'y en a pas encore. */
  invitation: InvitationVue | null
}

/**
 * Affiche l'invitation coach permanent active d'un club (QR + URL + actions
 * révoquer/régénérer) ou, à défaut, un bouton de génération (R26, R29). Server
 * Component : les actions sont des Server Actions (formulaires), aucun JS client.
 */
export function AfficheurInvitation({ titre, clubId, chemin, invitation }: Props) {
  return (
    <Carte className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold text-texte-fort">{titre}</h3>

      {invitation ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={invitation.qrDataUrl}
            alt={`QR de l'invitation coach du club ${titre}`}
            width={180}
            height={180}
            className="mx-auto rounded-xl bg-white p-2"
          />
          <code className="break-all text-center text-xs text-texte-doux">
            {invitation.url}
          </code>
          <div className="flex gap-2">
            <form action={regenererInvitation} className="flex-1">
              <input type="hidden" name="chemin" value={chemin} />
              <input type="hidden" name="invitationId" value={invitation.id} />
              <Bouton type="submit" variante="secondaire" taille="sm" pleineLargeur>
                Régénérer
              </Bouton>
            </form>
            <form action={revoquerInvitation} className="flex-1">
              <input type="hidden" name="chemin" value={chemin} />
              <input type="hidden" name="invitationId" value={invitation.id} />
              <Bouton type="submit" variante="danger" taille="sm" pleineLargeur>
                Révoquer
              </Bouton>
            </form>
          </div>
        </>
      ) : (
        <form action={genererInvitation}>
          <input type="hidden" name="chemin" value={chemin} />
          <input type="hidden" name="clubId" value={clubId} />
          <Bouton type="submit" pleineLargeur>
            Générer l’invitation
          </Bouton>
        </form>
      )}
    </Carte>
  )
}
