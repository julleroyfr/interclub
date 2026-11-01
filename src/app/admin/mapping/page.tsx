import type { Metadata } from 'next'

import { Carte, Coquille, EnTetePage, TitreSection } from '@/composants'
import { chargerContexteMapping } from '@/lib/auth/mapping'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'
import { chargerInvitationAdmin } from '@/lib/invitations/invitations-admin'

import { CarteInvitationAdmin } from './carte-invitation-admin'
import { FormulaireMapping } from './formulaire-mapping'
import { ListeComptes } from './liste-comptes'

/** Échecs des actions d'invitation administrateur (paramètre `erreur`). */
const ERREURS_INVITATION: Record<string, string> = {
  refuse: 'Seul un administrateur peut gérer les invitations administrateur.',
  generation: 'La génération de l’invitation a échoué. Réessayez.',
  revocation: 'La révocation de l’invitation a échoué. Réessayez.',
}

export const metadata: Metadata = {
  title: 'Mapping de rôle — Interclub',
}

export default async function PageMappingRole({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>
}) {
  // Administration du mapping réservée à l'admin (spec #2 R4). On masque
  // l'existence de l'écran aux non-admins (404 plutôt que 403).
  const admin = await exigerAdmin()

  const [{ comptes, clubs, listeComptes }, invitationAdmin, { erreur }] = await Promise.all([
    chargerContexteMapping(),
    chargerInvitationAdmin(),
    searchParams,
  ])
  const erreurInvitation = erreur ? ERREURS_INVITATION[erreur] : undefined

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Mapping de rôle"
          sousTitre="Attribuez un rôle applicatif (et un club pour un coach) à un compte existant, ou supprimez un compte."
        />

        <Carte className="max-w-xl p-6">
          <TitreSection>Attribuer un rôle</TitreSection>
          <FormulaireMapping comptes={comptes} clubs={clubs} />
        </Carte>

        {/* Invitation administrateur : QR à usage unique, 15 min (spec #2 R35–R40). */}
        <Carte className="max-w-xl p-6">
          {erreurInvitation && (
            <p role="alert" className="mb-4 text-sm text-danger">
              {erreurInvitation}
            </p>
          )}
          <CarteInvitationAdmin invitation={invitationAdmin} />
        </Carte>

        {/* Comptes permanents et suppression (spec #2 R41–R46). */}
        <section className="flex flex-col gap-3">
          <TitreSection>Comptes</TitreSection>
          <ListeComptes comptes={listeComptes} utilisateurCourantId={admin.id} />
        </section>
      </div>
    </Coquille>
  )
}
