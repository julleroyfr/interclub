import 'server-only'

import { getContexteCoach, getUtilisateurCourant } from '@/lib/auth/session'

// Gardes de LECTURE des loaders `service_role` (ADR 0005, décision D-C de la revue
// du 2026-10-03). Le client `service_role` contourne la RLS : chaque loader qui
// l'utilise appelle l'une de ces gardes en tête, en DÉFENSE EN PROFONDEUR — la
// page reste gardée par `exigerAdmin` / `exigerContexteCoach` (spec #12), mais une
// page qui oublierait sa garde ne divulgue plus rien.
//
// Contrairement aux gardes de page, elles ne font ni `notFound()` ni
// `redirect()` : un loader peut aussi servir une route (export PDF). Un appel non
// autorisé est une ERREUR DE PROGRAMMATION (la page aurait dû refuser avant) :
// on lève `LectureNonAutoriseeError`.
// Les résolutions de session sont mémorisées par requête (`cache`) : appeler la
// garde après celle de la page ne refait pas les lectures.

/** Lecture `service_role` demandée hors du périmètre autorisé (ADR 0005). */
export class LectureNonAutoriseeError extends Error {
  constructor(quoi: string) {
    super(`Lecture non autorisée (${quoi}).`)
    this.name = 'LectureNonAutoriseeError'
  }
}

/** Réservée à l'administrateur. */
export async function exigerLectureAdmin(quoi: string): Promise<void> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') throw new LectureNonAutoriseeError(quoi)
}

/** Administrateur, ou coach (permanent ou temporaire) — écrans de classement. */
export async function exigerLectureAdminOuCoach(quoi: string): Promise<void> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role === 'admin') return
  if (!(await getContexteCoach())) throw new LectureNonAutoriseeError(quoi)
}

/** Administrateur, ou coach PERMANENT du club `clubId`. */
export async function exigerLectureCoachDuClub(clubId: string, quoi: string): Promise<void> {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role === 'admin') return
  if (utilisateur?.role === 'coach' && utilisateur.clubId === clubId) return
  throw new LectureNonAutoriseeError(quoi)
}
