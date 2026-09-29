import { demandeurAdmin, reponseExportPdf } from '@/lib/export/export-classement'

/**
 * Export PDF des classements officiels, espace admin (spec #15 R3/R8). Les
 * layouts ne s'appliquant pas aux Route Handlers, la garde admin et la phase ⑤
 * sont vérifiées par `reponseExportPdf` (404 sinon, R1/R5).
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return reponseExportPdf(id, await demandeurAdmin())
}
