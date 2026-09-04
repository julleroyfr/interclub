import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  Carte,
  Cellule,
  CelluleTete,
  Coquille,
  CorpsTableau,
  EnTetePage,
  Etiquette,
  LigneTableau,
  Tableau,
  TeteTableau,
  TitreSection,
  type LienNav,
} from '@/composants'
import { chargerContexteMapping } from '@/lib/auth/mapping'
import { getUtilisateurCourant } from '@/lib/auth/session'

import { FormulaireMapping } from './formulaire-mapping'

export const metadata: Metadata = {
  title: 'Mapping de rôle — Interclub',
}

const liens: LienNav[] = [
  { href: '/', label: 'Accueil' },
  { href: '/admin/mapping', label: 'Rôles' },
]

export default async function PageMappingRole() {
  // Administration du mapping réservée à l'admin (spec #2 R4). On masque
  // l'existence de l'écran aux non-admins (404 plutôt que 403).
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') notFound()

  const { comptes, clubs, mappings } = await chargerContexteMapping()

  return (
    <Coquille liens={liens} largeur="large">
      <div className="flex flex-col gap-6">
        <EnTetePage
          titre="Mapping de rôle"
          sousTitre="Attribuez un rôle applicatif (et un club pour un coach) à un compte existant."
        />

        <Carte className="max-w-xl p-6">
          <TitreSection>Attribuer un rôle</TitreSection>
          <FormulaireMapping comptes={comptes} clubs={clubs} />
        </Carte>

        <section className="flex flex-col gap-3">
          <TitreSection>Mappings existants</TitreSection>
          {mappings.length === 0 ? (
            <p className="text-sm text-texte-attenue">
              Aucun compte n’a encore de rôle attribué.
            </p>
          ) : (
            <Tableau>
              <TeteTableau>
                <tr>
                  <CelluleTete>Compte</CelluleTete>
                  <CelluleTete>Rôle</CelluleTete>
                  <CelluleTete>Club</CelluleTete>
                </tr>
              </TeteTableau>
              <CorpsTableau>
                {mappings.map((m) => (
                  <LigneTableau key={m.utilisateurId}>
                    <Cellule>{m.email ?? m.utilisateurId}</Cellule>
                    <Cellule>
                      <Etiquette
                        variante={m.role === 'admin' ? 'accent' : 'succes'}
                      >
                        {m.role}
                      </Etiquette>
                    </Cellule>
                    <Cellule>{m.clubNom ?? '—'}</Cellule>
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
