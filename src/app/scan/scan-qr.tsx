'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { Bouton, Carte, EnTetePage, Pastille } from '@/composants'
import { decisionScan, interpreterResultatScan, urlDeRedirection } from '@/domaine/session-qr'
import { createClient } from '@/lib/supabase/client'

type Etat =
  | { type: 'en_cours' }
  | { type: 'deja_connecte'; email: string | null }
  | { type: 'succes' }
  | { type: 'erreur'; message: string }

function messageErreur(code: string): string {
  if (code === 'jeton_inconnu') return "Ce QR n'est pas reconnu."
  if (code === 'jeton_revoque') return "Ce QR a été révoqué. Demandez un nouveau QR à votre responsable."
  if (code === 'hors_fenetre') return "Ce QR n'est pas encore ouvert (ou la rencontre est terminée)."
  // Ancien code (avant fenêtre nature-dépendante, migration 202609011500) — compat.
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

  // Ouvre la session QR : utilisateur anonyme, liaison au jeton, redirection.
  // `estAnnule` évite de mettre à jour un composant démonté.
  const ouvrirSession = useCallback(
    async (valeur: string, estAnnule: () => boolean) => {
      const supabase = createClient()

      // Étape 1 — obtenir un utilisateur anonyme (R7, ADR 0001 §1).
      const { error: erreurAnon } = await supabase.auth.signInAnonymously()
      if (estAnnule()) return
      if (erreurAnon) {
        setEtat({ type: 'erreur', message: "Erreur d'authentification anonyme." })
        return
      }

      // Étape 2 — lier cet utilisateur au jeton et valider la fenêtre (R12, R22).
      const { data, error: erreurRpc } = await supabase.rpc('ouvrir_session_qr', {
        p_valeur: valeur,
      })
      if (estAnnule()) return
      if (erreurRpc) {
        setEtat({ type: 'erreur', message: messageErreur(erreurRpc.message) })
        return
      }

      // Étape 3 — interpréter le résultat et rediriger (R10, R11).
      try {
        const resultat = interpreterResultatScan(data)
        setEtat({ type: 'succes' })
        router.replace(urlDeRedirection(resultat))
      } catch {
        setEtat({ type: 'erreur', message: 'Résultat inattendu du serveur.' })
      }
    },
    [router],
  )

  useEffect(() => {
    if (!jeton) return
    const valeur = jeton

    let annule = false
    const estAnnule = () => annule

    async function demarrer() {
      // R34 : un compte permanent déjà connecté n'est pas remplacé d'office par
      // une session anonyme (revue du 2026-10-03, m5).
      const { data } = await createClient().auth.getUser()
      if (annule) return
      const utilisateur = data.user
      const decision = decisionScan(
        utilisateur
          ? { estAnonyme: utilisateur.is_anonymous ?? false, email: utilisateur.email ?? null }
          : null,
      )
      if (decision.type === 'proposer_choix') {
        setEtat({ type: 'deja_connecte', email: decision.email })
        return
      }
      await ouvrirSession(valeur, estAnnule)
    }

    demarrer()
    return () => { annule = true }
  }, [jeton, ouvrirSession])

  // R34 : choix explicite — fermer la session permanente de CET appareil
  // (scope local : les autres appareils du compte restent connectés), puis
  // ouvrir la session QR.
  async function deconnecterEtOuvrir() {
    if (!jeton) return
    setEtat({ type: 'en_cours' })
    const { error } = await createClient().auth.signOut({ scope: 'local' })
    if (error) {
      setEtat({ type: 'erreur', message: 'La déconnexion a échoué. Réessayez.' })
      return
    }
    await ouvrirSession(jeton, () => false)
  }

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

        {etat.type === 'deja_connecte' && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <Pastille variante="neutre" />
            <p className="text-sm text-texte">
              {etat.email ? (
                <>
                  Vous êtes connecté avec le compte{' '}
                  <span className="font-semibold text-texte-fort">{etat.email}</span>.
                </>
              ) : (
                'Vous êtes déjà connecté avec un compte.'
              )}
            </p>
            <p className="text-sm text-texte-attenue">
              Pour utiliser ce QR, il faut d’abord vous déconnecter de cet appareil.
            </p>
            <div className="flex w-full flex-col gap-3">
              <Bouton pleineLargeur onClick={() => router.replace('/')}>
                Aller à mon espace
              </Bouton>
              <Bouton variante="secondaire" pleineLargeur onClick={deconnecterEtOuvrir}>
                Me déconnecter et ouvrir la session QR
              </Bouton>
            </div>
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
