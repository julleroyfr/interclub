import type { Metadata } from 'next'

import {
  Carte,
  Coquille,
  EnTetePage,
  TitreSection,
} from '@/composants'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'
import { listerClubs } from '@/lib/clubs/clubs'
import { listerInvitationsActives } from '@/lib/invitations/invitations'

import { AfficheurInvitation } from './afficheur-invitation'
import { FormulaireClub } from './formulaire-club'
import { ListeClubs } from './liste-clubs'

export const metadata: Metadata = {
  title: 'Clubs — Interclub',
}

export default async function PageClubs() {
  // Paramétrage des clubs réservé à l'admin (spec #1 R11). On masque l'écran aux
  // non-admins (404 plutôt que 403). La RLS reste la vraie frontière.
  await exigerAdmin()

  const [clubs, invitations] = await Promise.all([
    listerClubs(),
    listerInvitationsActives(),
  ])

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Clubs"
          sousTitre="Créez et gérez les clubs de la compétition."
        />

        <Carte className="max-w-xl p-6">
          <TitreSection>Nouveau club</TitreSection>
          <FormulaireClub />
        </Carte>

        <section className="flex flex-col gap-3">
          <TitreSection>Clubs ({clubs.length})</TitreSection>
          <ListeClubs clubs={clubs} />
        </section>

        <section className="flex flex-col gap-3">
          <TitreSection>Invitations coach permanent</TitreSection>
          <p className="text-sm text-texte-attenue">
            Affichez le QR (ou l’URL) d’un club pour qu’un nouveau coach permanent
            crée son compte, automatiquement rattaché à ce club.
          </p>
          {clubs.length === 0 ? (
            <p className="text-sm text-texte-attenue">Aucun club.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clubs.map((c) => (
                <AfficheurInvitation
                  key={c.id}
                  titre={c.nom}
                  clubId={c.id}
                  chemin="/admin/clubs"
                  invitation={invitations.get(c.id) ?? null}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </Coquille>
  )
}
