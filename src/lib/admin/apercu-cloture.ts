'use server'

import { apercuCloture, type Manques } from '@/domaine/controle-np'
import { type Categorie } from '@/domaine/rencontre'
import { getUtilisateurCourant } from '@/lib/auth/session'

import { chargerDonneesNp } from './controle-np'

export type ApercuCloture =
  | {
      categorie: Categorie
      total: Manques
      parClub: ({ clubId: string; clubNom: string } & Manques)[]
    }
  | { erreur: string }

/**
 * Aperçu chiffré des manques, demandé à l'ouverture de la fenêtre de
 * confirmation de clôture (spec #3 R17bis c). Lecture seule, réservée à l'admin ;
 * la transition elle-même reste `changerPhaseRencontre` (mêmes gardes que R17).
 */
export async function lireApercuCloture(rencontreId: string): Promise<ApercuCloture> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') return { erreur: 'Réservé à un administrateur.' }
  try {
    const donnees = await chargerDonneesNp(rencontreId)
    if (!donnees) return { erreur: 'Rencontre introuvable.' }
    return { categorie: donnees.categorie, ...apercuCloture(donnees.entree) }
  } catch {
    return { erreur: 'L’aperçu n’a pas pu être calculé. Vous pouvez tout de même clôturer.' }
  }
}
