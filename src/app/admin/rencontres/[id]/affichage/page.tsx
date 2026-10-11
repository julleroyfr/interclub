import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { classementMixte } from '@/domaine/affichageEcran'
import { CATEGORIES, type Categorie } from '@/domaine/rencontre'
import { exigerAdmin } from '@/lib/auth/session'
import { getClassementRencontre } from '@/lib/classement/classement'

import { EcranDefilant } from './ecran-defilant'

export const metadata: Metadata = { title: 'Affichage écran secondaire — Interclub' }

const labelCategorie = (v: Categorie) =>
  CATEGORIES.find((c) => c.value === v)?.labelCourt ?? v

function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-')
  if (!a || !m || !j) return iso
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(j))).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Écran d'affichage secondaire (spec #14) : réservé à l'admin authentifié
 * (404 sinon, même garde que les autres écrans `/admin`). Réutilise le loader
 * du classement (spec #7) sans le recalculer ; la fusion Filles/Garçons pour
 * l'affichage mixte (R4/R5/R6) est faite par le domaine pur
 * `classementMixte`. Aucun abonnement temps réel (R11) : la page se recharge
 * uniquement à la fin de chaque boucle de défilement (R10, côté client).
 */
export default async function PageAffichageEcranSecondaire({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigerAdmin()

  const { id } = await params
  const classement = await getClassementRencontre(id)
  if (!classement) notFound()

  const lignes = classementMixte(classement.individuel.filles, classement.individuel.garcons).map(
    (ligne) => ({
      grimpeurId: ligne.grimpeurId,
      rang: ligne.rang,
      sexe: ligne.sexe,
      nom: ligne.nom,
      prenom: ligne.prenom,
      club: ligne.clubOrigineNom,
      score: ligne.score,
    }),
  )

  return (
    <EcranDefilant
      dateRencontre={formaterDate(classement.dateRencontre)}
      categorie={labelCategorie(classement.categorie)}
      visible={classement.visible}
      officiel={classement.officiel}
      lignes={lignes}
    />
  )
}
