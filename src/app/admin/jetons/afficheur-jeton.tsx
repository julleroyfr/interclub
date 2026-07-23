import { Bouton, Carte } from '@/composants'
import {
  genererJeton,
  regenererJeton,
  revoquerJeton,
} from '@/lib/jetons/actions'
import type { JetonVue } from '@/lib/jetons/jetons'

type Perimetre = {
  rencontreId: string
  nature: 'coach_temporaire' | 'juge'
  clubId?: string | null
  voieVitesseId?: string | null
}

type Props = {
  titre: string
  chemin: string
  perimetre: Perimetre
  /** Jeton actif de ce périmètre, ou `null` s'il n'y en a pas encore. */
  jeton: JetonVue | null
}

/**
 * Affiche le jeton actif d'un périmètre (QR + actions révoquer/régénérer) ou,
 * s'il n'existe pas, un bouton de génération. Server Component : les actions
 * sont des Server Actions (formulaires), aucune JS client nécessaire.
 */
export function AfficheurJeton({ titre, chemin, perimetre, jeton }: Props) {
  return (
    <Carte className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold text-texte-fort">{titre}</h3>

      {jeton ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={jeton.qrDataUrl}
            alt={`QR du jeton ${titre}`}
            width={180}
            height={180}
            className="mx-auto rounded-xl bg-white p-2"
          />
          <code className="break-all text-center text-xs text-texte-doux">
            {jeton.valeur}
          </code>
          <div className="flex gap-2">
            <form action={regenererJeton} className="flex-1">
              <input type="hidden" name="chemin" value={chemin} />
              <input type="hidden" name="jetonId" value={jeton.id} />
              <Bouton type="submit" variante="secondaire" taille="sm" pleineLargeur>
                Régénérer
              </Bouton>
            </form>
            <form action={revoquerJeton} className="flex-1">
              <input type="hidden" name="chemin" value={chemin} />
              <input type="hidden" name="jetonId" value={jeton.id} />
              <Bouton type="submit" variante="danger" taille="sm" pleineLargeur>
                Révoquer
              </Bouton>
            </form>
          </div>
        </>
      ) : (
        <form action={genererJeton}>
          <input type="hidden" name="chemin" value={chemin} />
          <input type="hidden" name="rencontreId" value={perimetre.rencontreId} />
          <input type="hidden" name="nature" value={perimetre.nature} />
          {perimetre.clubId != null && (
            <input type="hidden" name="clubId" value={perimetre.clubId} />
          )}
          {perimetre.voieVitesseId != null && (
            <input
              type="hidden"
              name="voieVitesseId"
              value={perimetre.voieVitesseId}
            />
          )}
          <Bouton type="submit" pleineLargeur>
            Générer le jeton
          </Bouton>
        </form>
      )}
    </Carte>
  )
}
