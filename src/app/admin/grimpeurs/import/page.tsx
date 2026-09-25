import type { Metadata } from 'next'

import { Coquille, EnTetePage } from '@/composants'
import { anneeReferenceParDefaut } from '@/domaine/import-licencies'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'

import { FormulaireImport } from './formulaire-import'

export const metadata: Metadata = {
  title: 'Importer des licenciés — Interclub',
}

/** Date du jour (calendrier local) au format ISO `AAAA-MM-JJ`. */
function aujourdhuiISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default async function PageImportLicencies() {
  // Écran réservé à l'admin (spec #13 R1). La RLS reste la vraie frontière.
  await exigerAdmin()

  const anneeDefaut = anneeReferenceParDefaut(aujourdhuiISO())

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Importer des licenciés"
          sousTitre="Déposez un export FFME (.xlsx). Seuls les licenciés de 18 ans au plus sont importés ; les clubs manquants sont créés, les grimpeurs déjà connus (licence) sont mis à jour."
        />
        <FormulaireImport anneeDefaut={anneeDefaut} />
      </div>
    </Coquille>
  )
}
