import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  Carte,
  Cellule,
  CelluleTete,
  Coquille,
  CorpsTableau,
  EnTetePage,
  LigneTableau,
  Tableau,
  TeteTableau,
  TitreSection,
  type LienNav,
} from '@/composants'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { chargerContextePrets } from '@/lib/prets/prets'

import { BoutonRevoquerPret, FormulairePret } from './prets-client'

export const metadata: Metadata = { title: 'Prêts de grimpeurs — Interclub' }

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin', label: 'Tableau de bord' },
  { href: '/admin/prets', label: 'Prêts' },
]

/**
 * Écran admin de gestion des prêts (spec #1 R35) : mettre un grimpeur d'un autre
 * club à disposition d'un club d'accueil pour une rencontre, et révoquer un prêt.
 * Une fois le prêt créé, le coach d'accueil voit le grimpeur dans son roster
 * (spec #5 R12/R13). Réservé à l'admin (404 sinon).
 */
export default async function PagePrets() {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const { rencontres, grimpeurs, clubs, prets } = await chargerContextePrets()

  return (
    <Coquille liens={liens}>
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Prêts de grimpeurs"
          sousTitre="Mettez un grimpeur à disposition d'un club d'accueil pour une rencontre (R35). Le coach d'accueil le gère alors comme les siens."
        />

        <Carte className="max-w-xl p-6">
          <TitreSection>Créer un prêt</TitreSection>
          <FormulairePret rencontres={rencontres} grimpeurs={grimpeurs} clubs={clubs} />
        </Carte>

        <section className="flex flex-col gap-3">
          <TitreSection>Prêts en cours</TitreSection>
          {prets.length === 0 ? (
            <p className="text-sm text-texte-attenue">Aucun prêt en cours.</p>
          ) : (
            <Tableau>
              <TeteTableau>
                <tr>
                  <CelluleTete>Rencontre</CelluleTete>
                  <CelluleTete>Grimpeur</CelluleTete>
                  <CelluleTete>Club d'origine</CelluleTete>
                  <CelluleTete>Club d'accueil</CelluleTete>
                  <CelluleTete>Action</CelluleTete>
                </tr>
              </TeteTableau>
              <CorpsTableau>
                {prets.map((p) => (
                  <LigneTableau key={`${p.rencontreId}:${p.grimpeurId}`}>
                    <Cellule>{p.rencontreLabel}</Cellule>
                    <Cellule>{p.grimpeurNom}</Cellule>
                    <Cellule>{p.clubOrigineNom}</Cellule>
                    <Cellule>{p.clubAccueilNom}</Cellule>
                    <Cellule>
                      <BoutonRevoquerPret
                        rencontreId={p.rencontreId}
                        grimpeurId={p.grimpeurId}
                      />
                    </Cellule>
                  </LigneTableau>
                ))}
              </CorpsTableau>
            </Tableau>
          )}
        </section>
      </div>
    </Coquille>
  )
}
