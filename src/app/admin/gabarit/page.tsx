import type { Metadata } from 'next'

import { Coquille, EnTetePage, TitreSection } from '@/composants'
import { CATEGORIES } from '@/domaine/rencontre'
import { liensAdmin } from '@/lib/admin/navigation'
import { exigerAdmin } from '@/lib/auth/session'
import { listerGabarit } from '@/lib/gabarit/gabarit'

import { PanneauGabarit } from './panneau-gabarit'

export const metadata: Metadata = { title: 'Gabarit — Interclub' }

export default async function PageGabarit() {
  await exigerAdmin()

  const [gabaritEnfant, gabaritAdo] = await Promise.all([
    listerGabarit('enfant'),
    listerGabarit('ado'),
  ])

  return (
    <Coquille liens={liensAdmin()} largeur="large" deconnexion>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Gabarit de rencontre"
          sousTitre="Modèle d'épreuves et de voies appliqué automatiquement à la création d'une rencontre. Les modifications n'affectent pas les rencontres déjà créées."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {CATEGORIES.map((cat) => (
            <PanneauGabarit
              key={cat.value}
              categorie={cat.value}
              label={cat.labelCourt}
              epreuves={cat.value === 'enfant' ? gabaritEnfant : gabaritAdo}
            />
          ))}
        </div>

        <section className="flex flex-col gap-2">
          <TitreSection>Légende des niveaux</TitreSection>
          <p className="text-sm text-texte-attenue">
            Moulinette : M1–M4 (enfant uniquement). Tête : T1–T10 (enfant et ado).
            Un même niveau peut apparaître plusieurs fois (voie doublée ou triplée).
          </p>
        </section>
      </div>
    </Coquille>
  )
}
