import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  Carte,
  Coquille,
  EnTetePage,
  TitreSection,
  type LienNav,
} from '@/composants'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { listerClubsOptions, listerGrimpeurs } from '@/lib/grimpeurs/grimpeurs'

import { FormulaireGrimpeur } from './formulaire-grimpeur'
import { ListeGrimpeurs } from './liste-grimpeurs'

export const metadata: Metadata = {
  title: 'Grimpeurs — Interclub',
}

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin/grimpeurs', label: 'Grimpeurs' },
]

export default async function PageGrimpeurs() {
  // Volet admin du roster (spec #1 R11/R13). On masque l'écran aux non-admins
  // (404 plutôt que 403). La RLS reste la vraie frontière (elle admet aussi le
  // coach du club, R18 — via un futur écran coach).
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const [grimpeurs, clubs] = await Promise.all([
    listerGrimpeurs(),
    listerClubsOptions(),
  ])

  return (
    <Coquille liens={liens} largeur="large">
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Grimpeurs"
          sousTitre="Gérez le roster des grimpeurs licenciés, par club."
        />

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
