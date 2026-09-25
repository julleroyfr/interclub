import type { Metadata } from 'next'
import Link from 'next/link'

import {
  Carte,
  Coquille,
  EnTetePage,
  TitreSection,
} from '@/composants'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'
import { listerClubsOptions, listerGrimpeurs } from '@/lib/grimpeurs/grimpeurs'

import { FormulaireGrimpeur } from './formulaire-grimpeur'
import { ListeGrimpeurs } from './liste-grimpeurs'

export const metadata: Metadata = {
  title: 'Grimpeurs — Interclub',
}

export default async function PageGrimpeurs() {
  // Volet admin du roster (spec #1 R11/R13). On masque l'écran aux non-admins
  // (404 plutôt que 403). La RLS reste la vraie frontière (elle admet aussi le
  // coach du club, R18 — via un futur écran coach).
  await exigerAdmin()

  const [grimpeurs, clubs] = await Promise.all([
    listerGrimpeurs(),
    listerClubsOptions(),
  ])

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <EnTetePage
            titre="Grimpeurs"
            sousTitre="Gérez le roster des grimpeurs licenciés, par club."
          />
          <Link
            href="/admin/grimpeurs/import"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-admin/40 bg-admin/15 px-4 py-2 text-sm font-semibold text-admin hover:bg-admin/25"
          >
            📥 Importer des licenciés
          </Link>
        </div>

        {clubs.length === 0 ? (
          <Carte className="max-w-xl p-6">
            <p className="text-sm text-texte-attenue">
              Créez d’abord un club pour lui rattacher des grimpeurs.
            </p>
          </Carte>
        ) : (
          <Carte className="max-w-xl p-6">
            <TitreSection>Nouveau grimpeur</TitreSection>
            <FormulaireGrimpeur clubs={clubs} />
          </Carte>
        )}

        <section className="flex flex-col gap-3">
          <TitreSection>Grimpeurs ({grimpeurs.length})</TitreSection>
          <ListeGrimpeurs grimpeurs={grimpeurs} clubs={clubs} />
        </section>
      </div>
    </Coquille>
  )
}
