import Link from 'next/link'

import { seDeconnecter } from '@/lib/auth/actions'
import { getUtilisateurCourant } from '@/lib/auth/session'

export default async function Accueil() {
  const utilisateur = await getUtilisateurCourant()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Interclub</h1>

      {utilisateur ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-gray-600">{utilisateur.email}</p>
          <p>
            Rôle :{' '}
            <span className="font-medium">
              {utilisateur.role ?? 'aucun rôle attribué'}
            </span>
          </p>
          <form action={seDeconnecter}>
            <button
              type="submit"
              className="min-h-11 rounded-md border border-gray-300 px-4 font-medium"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      ) : (
        <Link
          href="/connexion"
          className="min-h-11 rounded-md bg-gray-900 px-4 py-2.5 font-medium text-white"
        >
          Se connecter
        </Link>
      )}
    </main>
  )
}
