import type { Metadata } from 'next'
import Link from 'next/link'

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
        {/* Import CSV sans licence (spec #18 R2). */}
        <p className="text-sm text-texte-attenue">
          Liste de club sans numéros de licence (format Marsas) ?{' '}
          <Link
            href="/admin/grimpeurs/import-csv"
            className="font-semibold text-admin hover:underline"
          >
            Importer un CSV sans licence →
          </Link>
        </p>
      </div>
    </Coquille>
  )
}
