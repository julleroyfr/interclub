import { MESSAGE_PLAFOND_VOIES_ADO } from '@/domaine/resultat'

// Classement des refus des fonctions d'enregistrement (spec #17 R17–R20 ;
// messages lisibles : spec #6 R4, spec #10 R4). Fonction pure, partagée par les
// actions coach et juge.
//   - definitif  : la saisie passe « rejetée » et n'est plus renvoyée (R18) ;
//   - session    : session absente — la saisie reste en attente, rejouée après
//                  nouveau scan / reconnexion (R19) ;
//   - temporaire : la base est injoignable — nouvel essai plus tard (R17).

export type NatureRefus = 'definitif' | 'session' | 'temporaire'

export type Refus = { nature: NatureRefus; message: string }

const MESSAGES: Record<string, string> = {
  saisie_plus_ancienne: 'Une saisie plus récente existe déjà.',
  competition_cloturee:
    'La compétition est clôturée : cette saisie n’a pas été enregistrée. Signalez-la à l’organisateur.',
  hors_competition: "La saisie n'est ouverte qu'en phase compétition.",
  hors_perimetre: 'Saisie non autorisée : grimpeur hors de votre périmètre.',
  voie_introuvable: 'Voie introuvable.',
  bloc_introuvable: 'Bloc introuvable.',
  issue_non_admise: 'Issue non admise pour cette voie ou ce bloc.',
  palier_invalide: 'Le palier choisi doit appartenir au bloc.',
  plafond_voies_ado: MESSAGE_PLAFOND_VOIES_ADO,
  grimpeur_non_engage: 'Ce grimpeur n’est pas engagé dans la rencontre.',
}

const SESSION_ABSENTE = 'Session expirée : reconnectez-vous ou rescannez le QR code.'

/** Classe une erreur renvoyée par la base et la traduit en message lisible. */
export function classerRefus(erreur: { message?: string; code?: string }): Refus {
  const message = erreur.message ?? ''
  if (
    message === 'session_absente' ||
    message === 'session_juge_absente' ||
    message.startsWith('permission denied for function') ||
    message.startsWith('JWT') ||
    erreur.code === 'PGRST301'
  ) {
    return { nature: 'session', message: SESSION_ABSENTE }
  }
  if (message.includes('fetch failed') || message.includes('NetworkError')) {
    return { nature: 'temporaire', message: 'Serveur injoignable : nouvel essai automatique.' }
  }
  return { nature: 'definitif', message: MESSAGES[message] ?? 'La saisie a échoué. Réessayez.' }
}
