import { nomFichierNp } from '@/domaine/controle-np'
import { chargerControleNpApresCloture } from '@/lib/admin/controle-np'
import { getUtilisateurCourant } from '@/lib/auth/session'
import { rendrePdfNpClub, rendrePdfNpParNiveau } from '@/lib/export/rendu-pdf-np'

const introuvable = () => new Response('Introuvable', { status: 404 })

/**
 * Exports PDF du contrôle des NP (spec #3 R41r, R41s) : sans paramètre, le PDF
 * « par niveau » pour l'admin ; avec `?club=<id>`, le PDF de ce club pour ses
 * coachs. Les layouts ne s'appliquant pas aux Route Handlers, le rôle admin et
 * la phase ④/⑤ sont revérifiés ici (404 sinon).
 */
export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await getUtilisateurCourant()
  if (utilisateur?.role !== 'admin') return introuvable()

  const { id } = await params
  const donnees = await chargerControleNpApresCloture(id)
  if (!donnees) return introuvable()

  const clubId = new URL(requete.url).searchParams.get('club')
  const maintenant = new Date()
  let octets: Uint8Array
  let nom: string
  if (clubId) {
    const club = await rendrePdfNpClub(donnees, clubId, maintenant)
    if (!club) return introuvable()
    octets = club.octets
    nom = nomFichierNp(donnees.dateRencontre, club.clubNom)
  } else {
    octets = await rendrePdfNpParNiveau(donnees, maintenant)
    nom = nomFichierNp(donnees.dateRencontre)
  }

  return new Response(new Blob([octets as BlobPart], { type: 'application/pdf' }), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nom}"`,
      // Document nominatif produit à la demande : jamais mis en cache partagé.
      'Cache-Control': 'private, no-store',
    },
  })
}
