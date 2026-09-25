import type { Metadata } from 'next'

import { Coquille, EnTetePage } from '@/composants'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'

import { FormulaireImport } from './formulaire-import'

export const metadata: Metadata = {
  title: 'Importer des licenciés — Interclub',
}

export default async function PageImportLicencies() {
  // Écran réservé à l'admin (spec #13 R1). La RLS reste la vraie frontière.
  await exigerAdmin()

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Importer des licenciés"
          sousTitre="Déposez un export FFME (.xlsx). Seuls les licenciés de 18 ans au plus sont importés ; les clubs manquants sont créés, les grimpeurs déjà connus (licence) sont mis à jour."
        />
        <FormulaireImport />
      </div>
    </Coquille>
  )
}
