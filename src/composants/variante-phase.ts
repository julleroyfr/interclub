import type { Phase } from '@/domaine/rencontre'

import type { VarianteEtiquette } from './Etiquette'

/**
 * Couleur d'`Etiquette` par phase de rencontre (spec #1 R5), homogène dans toute
 * l'app : vert = édition à distance (①), orange = préparation jour J (②), cyan =
 * compétition en cours (③), ambre = clôture/vérification (④), gris = résultats
 * verrouillés (⑤).
 */
export const variantePhase: Record<Phase, VarianteEtiquette> = {
  pre_competition: 'succes',
  preparation: 'prepa',
  competition: 'accent',
  cloture: 'attention',
  resultats_publics: 'neutre',
}
