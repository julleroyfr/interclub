import type { Metadata } from 'next'
import Link from 'next/link'

import { Coquille, EnTetePage } from '@/composants'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'
import { listerClubsOptions } from '@/lib/grimpeurs/grimpeurs'

import { FormulaireImportCsv } from './formulaire-import-csv'

export const metadata: Metadata = {
  title: 'Importer un CSV sans licence — Interclub',
}

export default async function PageImportCsv() {
  // Écran réservé à l'admin (spec #18 R1). La RLS reste la vraie frontière.
  await exigerAdmin()
  const clubs = await listerClubsOptions()

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <div>
          <Link href="/admin/grimpeurs/import" className="text-sm text-texte-attenue hover:text-texte">
            ← Import FFME
          </Link>
          <EnTetePage
            titre="Importer un CSV sans licence"
            sousTitre="Déposez la liste d’un club sans numéros de licence (format Marsas). Les grimpeurs déjà connus du club sont reconnus par leur identité ; les autres sont créés avec une licence générée."
          />
        </div>
        <FormulaireImportCsv clubs={clubs} />
      </div>
    </Coquille>
  )
}
