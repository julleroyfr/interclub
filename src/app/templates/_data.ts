// Données fictives des écrans d'exemple du template « Nuit ».
// Aucune logique métier, aucun accès Supabase : uniquement de quoi illustrer
// les écrans (dashboard admin, saisie équipe, saisie vitesse).

// --- Dashboard admin -------------------------------------------------------

export const statsAdmin = [
  { label: 'Rencontres à venir', valeur: '4', detail: 'sur 12 programmées' },
  { label: 'Clubs engagés', valeur: '9', detail: '+2 cette saison' },
  { label: 'Grimpeurs licenciés', valeur: '184', detail: '32 équipes' },
  { label: 'Juges affectés', valeur: '11', detail: '3 en attente' },
]

export const rencontres = [
  {
    id: 'R-2026-07',
    date: '26 juil.',
    domicile: 'ESC Bordeaux',
    visiteur: 'Roc Altitude',
    categorie: 'Minimes — matin',
    statut: 'À venir',
  },
  {
    id: 'R-2026-06',
    date: '19 juil.',
    domicile: 'Vertical Mérignac',
    visiteur: 'Grimpe Pessac',
    categorie: 'Cadets — après-midi',
    statut: 'En cours',
  },
  {
    id: 'R-2026-05',
    date: '12 juil.',
    domicile: 'Roc Altitude',
    visiteur: 'ESC Bordeaux',
    categorie: 'Juniors — matin',
    statut: 'Clôturée',
  },
  {
    id: 'R-2026-04',
    date: '05 juil.',
    domicile: 'Grimpe Pessac',
    visiteur: 'Vertical Mérignac',
    categorie: 'Seniors — après-midi',
    statut: 'Clôturée',
  },
]

export const clubs = [
  { nom: 'ESC Bordeaux', equipes: 6, grimpeurs: 41 },
  { nom: 'Roc Altitude', equipes: 5, grimpeurs: 33 },
  { nom: 'Vertical Mérignac', equipes: 4, grimpeurs: 28 },
  { nom: 'Grimpe Pessac', equipes: 3, grimpeurs: 22 },
]

// --- Saisie résultats d'une équipe (voie / bloc) ---------------------------

export const equipe = {
  club: 'ESC Bordeaux',
  nom: 'Équipe A — Minimes',
  rencontre: 'ESC Bordeaux vs Roc Altitude · 26 juil.',
  grimpeurs: [
    { id: 'g1', nom: 'Léa Marchand', voie: 42, bloc: 3, statut: 'saisi' },
    { id: 'g2', nom: 'Tom Rivière', voie: 38, bloc: 4, statut: 'saisi' },
    { id: 'g3', nom: 'Inès Fabre', voie: null, bloc: 2, statut: 'partiel' },
    { id: 'g4', nom: 'Noah Lemoine', voie: null, bloc: null, statut: 'vide' },
    { id: 'g5', nom: 'Jade Colin', voie: 51, bloc: 5, statut: 'saisi' },
  ],
}

// --- Saisie résultats de vitesse -------------------------------------------

export const vitesse = {
  rencontre: 'Vertical Mérignac vs Grimpe Pessac',
  epreuve: 'Vitesse — Cadets',
  juge: 'Karim B. (juge affecté)',
  grimpeurs: [
    { id: 'v1', nom: 'Enzo Perrin', club: 'Vertical Mérignac', resultat: 'temps', centiemes: 812 },
    { id: 'v2', nom: 'Manon Girard', club: 'Grimpe Pessac', resultat: 'temps', centiemes: 934 },
    { id: 'v3', nom: 'Hugo Renard', club: 'Vertical Mérignac', resultat: 'chute', centiemes: null },
    { id: 'v4', nom: 'Sofia Dumas', club: 'Grimpe Pessac', resultat: 'non_presentation', centiemes: null },
    { id: 'v5', nom: 'Lucas Brun', club: 'Vertical Mérignac', resultat: null, centiemes: null },
  ],
}

/** Formate un temps en centièmes → « 8″12 ». */
export function formaterTemps(centiemes: number | null): string {
  if (centiemes == null) return '—'
  const s = Math.floor(centiemes / 100)
  const c = String(centiemes % 100).padStart(2, '0')
  return `${s}″${c}`
}

export function libelleResultat(r: string | null): string {
  switch (r) {
    case 'temps':
      return 'Temps'
    case 'chute':
      return 'Chute'
    case 'non_presentation':
      return 'Non présentation'
    default:
      return 'À saisir'
  }
}
