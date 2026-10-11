import { demandeurCoach, reponseExportPdf } from '@/lib/export/export-classement'

/**
 * Export PDF des classements officiels, espace coach (spec #15 R4/R8) : coach
 * permanent dont le club est engagé, rencontre en ⑤ — vérifié par
 * `reponseExportPdf` (404 sinon, R1/R4/R5).
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return reponseExportPdf(id, await demandeurCoach())
}
