import { reponseRapportPeriodique } from '@/lib/rapport/rapport-periodique'

/**
 * Rapport périodique (spec #19), appelé par le cron de l'hébergeur (`vercel.json`).
 * Garde du secret, lecture, logs et enregistrement : `reponseRapportPeriodique`.
 */
export async function GET(requete: Request) {
  return reponseRapportPeriodique(requete)
}
