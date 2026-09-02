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

// Grimpeurs engagés en baseline (A1 = Ana+Bob, B1 = Cléo).
export const GRIMPEURS = {
  ana: 'a0000000-0000-0000-0000-0000000000a1',
  bob: 'a0000000-0000-0000-0000-0000000000a2',
  cleo: 'b0000000-0000-0000-0000-0000000000b1',
  devi: 'b0000000-0000-0000-0000-0000000000b2', // Club B, libre (prêt CT-05)
} as const

// Pool de 8 grimpeurs Club A LIBRES (non engagés) — label = « Prénom Nom » tel
// qu'affiché dans le sélecteur de roster.
export const POOL_LIBRES = [
  { id: 'a0000000-0000-0000-0000-0000000000a3', label: 'Chloé Alpha' },
  { id: 'a0000000-0000-0000-0000-0000000000a4', label: 'David Alpha' },
  { id: 'a0000000-0000-0000-0000-0000000000a5', label: 'Emma Alpha' },
  { id: 'a0000000-0000-0000-0000-0000000000a6', label: 'Félix Alpha' },
  { id: 'a0000000-0000-0000-0000-0000000000a7', label: 'Gaby Alpha' },
  { id: 'a0000000-0000-0000-0000-0000000000a8', label: 'Hugo Alpha' },
  { id: 'a0000000-0000-0000-0000-0000000000a9', label: 'Iris Alpha' },
  { id: 'a0000000-0000-0000-0000-0000000000aa', label: 'Jade Alpha' },
] as const

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
