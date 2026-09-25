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

        <Carte className="max-w-xl p-4">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
              <TitreSection>Nouveau club</TitreSection>
              <span className="text-sm text-texte-attenue transition-transform group-open:rotate-45">
                ＋
              </span>
            </summary>
            <div className="mt-2">
              <FormulaireClub />
            </div>
          </details>
        </Carte>

        <section className="flex flex-col gap-3">
          <TitreSection>Clubs ({clubs.length})</TitreSection>
          <ListeClubs clubs={clubs} invitations={Object.fromEntries(invitations)} />
        </section>
      </div>
    </Coquille>
  )
}
