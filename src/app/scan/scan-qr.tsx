'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Carte, EnTetePage, Pastille } from '@/composants'
import { interpreterResultatScan, urlDeRedirection } from '@/domaine/session-qr'
import { createClient } from '@/lib/supabase/client'

type Etat =
  | { type: 'en_cours' }
  | { type: 'succes' }
  | { type: 'erreur'; message: string }

function messageErreur(code: string): string {
  if (code === 'jeton_inconnu') return "Ce QR n'est pas reconnu."
  if (code === 'jeton_revoque') return "Ce QR a été révoqué. Demandez un nouveau QR à votre responsable."
  if (code === 'hors_phase_competition') return "La rencontre n'est pas encore en cours (ou est terminée)."
  return "Impossible d'ouvrir la session. Réessayez ou demandez un nouveau QR."
}

export function ScanQr() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const jeton = searchParams.get('jeton')
  // L'absence de jeton est dérivable au rendu : pas besoin d'effet (ni de
  // setState synchrone) pour cet état d'erreur initial.
  const [etat, setEtat] = useState<Etat>(
    jeton ? { type: 'en_cours' } : { type: 'erreur', message: 'QR invalide — paramètre manquant.' },
  )

  useEffect(() => {
    if (!jeton) return
    const valeur = jeton

    let annule = false

    async function ouvrirSession() {
      const supabase = createClient()

      // Étape 1 — obtenir un utilisateur anonyme (R7, ADR 0001 §1).
      const { error: erreurAnon } = await supabase.auth.signInAnonymously()
      if (annule) return
      if (erreurAnon) {
        setEtat({ type: 'erreur', message: "Erreur d'authentification anonyme." })
        return
      }

      // Étape 2 — lier cet utilisateur au jeton et valider la fenêtre (R12, R22).
      const { data, error: erreurRpc } = await supabase.rpc('ouvrir_session_qr', {
        p_valeur: valeur,
      })
      if (annule) return
      if (erreurRpc) {
        setEtat({ type: 'erreur', message: messageErreur(erreurRpc.message) })
        return
      }

      // Étape 3 — interpréter le résultat et rediriger (R10, R11).
      try {
        const resultat = interpreterResultatScan(data)
        setEtat({ type: 'succes' })
        router.replace(urlDeRedirection(resultat.nature))
      } catch {
        setEtat({ type: 'erreur', message: 'Résultat inattendu du serveur.' })
      }
    }

    ouvrirSession()
    return () => { annule = true }
  }, [jeton, router])

  return (
    <div className="grid min-h-screen place-items-center bg-fond bg-[radial-gradient(60rem_40rem_at_top,#0e2a3b,transparent)] px-4 py-10 text-texte">
      <Carte className="w-full max-w-sm p-8 text-center">
        <EnTetePage titre="Ouverture de session" />

        {etat.type === 'en_cours' && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <Pastille variante="neutre" />
            <p className="text-sm text-texte-attenue">Connexion en cours…</p>
          </div>
        )}

        {etat.type === 'succes' && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <Pastille variante="succes" />
            <p className="text-sm text-texte-attenue">Session ouverte — redirection…</p>
          </div>
        )}

        {etat.type === 'erreur' && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <Pastille variante="danger" />
            <p role="alert" className="text-sm text-danger">
              {etat.message}
            </p>
            <p className="text-sm text-texte-attenue">
              Scannez à nouveau le QR ou contactez votre responsable.
            </p>
          </div>
        )}
      </Carte>
    </div>
  )
}
