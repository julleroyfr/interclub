import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Coquille, EnTetePage, type LienNav } from '@/composants'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { getStructureRencontre } from '@/lib/rencontres/structure'

import { PanneauStructure } from './panneau-structure'

export const metadata: Metadata = {
  title: 'Configuration d’une rencontre — Interclub',
}

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin/rencontres', label: 'Rencontres' },
]

export default async function PageConfigurationRencontre({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Écran réservé à l'admin (R40, spec #1 R12) : 404 pour les autres rôles.
  // La RLS reste la vraie frontière.
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const { id } = await params
  const structure = await getStructureRencontre(id)
  if (!structure) notFound()

  return (
    <Coquille liens={liens}>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Configurer la rencontre"
          sousTitre="Ajoutez voies, blocs et voies de vitesse à cette rencontre (R36)."
        />
        <PanneauStructure structure={structure} />
      </div>
    </Coquille>
  )
}
