// Constantes du jeu de données seed (supabase/seed/01-jeu-de-test.sql), reprises
// du cahier docs/tests/13-espace-coach.cahier.md § « Jeu de données initial ».
// Un seul endroit à mettre à jour si le seed évolue.

export const MDP = 'interclub'

export const COMPTES = {
  admin: { email: 'admin@test.local', mdp: MDP },
  coach: { email: 'coach@test.local', mdp: MDP }, // coach permanent Club A
  sansMapping: { email: 'sansmapping@test.local', mdp: MDP }, // aucun rôle
} as const

export const CLUB_A = '11111111-1111-1111-1111-111111111111'

export const RENCONTRE_PILOTE = '33333333-3333-3333-3333-333333333333'
export const RENCONTRE_PILOTE_DATE = '2026-09-19'

export const EQUIPES = {
  A1: '66666666-6666-6666-6666-666666666666', // Ana Alpha + Bob Alpha
  A2: '66666666-6666-6666-6666-666666666602', // vide
  B1: '77777777-7777-7777-7777-777777777777', // Club B — Cléo Bravo
} as const

// Valeurs (secrets) des jetons QR actifs du seed.
export const JETON = {
  coachTemp: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  juge: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
} as const

// Les 5 phases du cycle, dans l'ordre (spec #1).
export type Phase =
  | 'pre_competition'
  | 'preparation'
  | 'competition'
  | 'cloture'
  | 'resultats_publics'
