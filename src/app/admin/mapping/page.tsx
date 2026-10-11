import type { Metadata } from 'next'

import {
  Carte,
  Cellule,
  CelluleTete,
  Coquille,
  CorpsTableau,
  EnTetePage,
  Etiquette,
  LigneTableau,
  Tableau,
  TeteTableau,
  TitreSection,

} from '@/composants'
import { chargerContexteMapping } from '@/lib/auth/mapping'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'
import { chargerInvitationAdmin } from '@/lib/invitations/invitations-admin'

import { CarteInvitationAdmin } from './carte-invitation-admin'
import { FormulaireMapping } from './formulaire-mapping'

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
  await exigerAdmin()

  const [{ comptes, clubs, mappings }, invitationAdmin, { erreur }] = await Promise.all([
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
          sousTitre="Attribuez un rôle applicatif (et un club pour un coach) à un compte existant."
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

        <section className="flex flex-col gap-3">
          <TitreSection>Mappings existants</TitreSection>
          {mappings.length === 0 ? (
            <p className="text-sm text-texte-attenue">
              Aucun compte n’a encore de rôle attribué.
            </p>
          ) : (
            <Tableau>
              <TeteTableau>
                <tr>
                  <CelluleTete>Compte</CelluleTete>
                  <CelluleTete>Rôle</CelluleTete>
                  <CelluleTete>Club</CelluleTete>
                </tr>
              </TeteTableau>
              <CorpsTableau>
                {mappings.map((m) => (
                  <LigneTableau key={m.utilisateurId}>
                    <Cellule>{m.email ?? m.utilisateurId}</Cellule>
                    <Cellule>
                      <Etiquette
                        variante={m.role === 'admin' ? 'accent' : 'succes'}
                      >
                        {m.role}
                      </Etiquette>
                    </Cellule>
                    <Cellule>{m.clubNom ?? '—'}</Cellule>
                  </LigneTableau>
                ))}
              </CorpsTableau>
            </Tableau>
          )}
        </section>
      </div>
    </Coquille>
  )
}
