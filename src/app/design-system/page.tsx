import {
  Bouton,
  Carte,
  Cellule,
  CelluleTete,
  ChampSelect,
  ChampTexte,
  CorpsTableau,
  EnTetePage,
  Etiquette,
  LigneTableau,
  Pastille,
  Tableau,
  TeteTableau,
  TitreSection,
} from '@/composants'

export const metadata = { title: 'Design system · Interclub' }

const tokens = [
  { nom: 'fond', classe: 'bg-fond' },
  { nom: 'surface', classe: 'bg-surface' },
  { nom: 'surface-forte', classe: 'bg-surface-forte' },
  { nom: 'accent', classe: 'bg-accent' },
  { nom: 'secondaire', classe: 'bg-secondaire' },
  { nom: 'danger', classe: 'bg-danger' },
]

function Bloc({
  titre,
  children,
}: {
  titre: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <TitreSection>{titre}</TitreSection>
      <Carte className="mt-3 p-5">{children}</Carte>
    </section>
  )
}

export default function GalerieDesignSystem() {
  return (
    <div className="mx-auto max-w-4xl">
      <EnTetePage
        titre="Design system « Nuit »"
        sousTitre="Composants homogènes et réutilisables — thème sombre, verre, cyan / lime."
      />

      <Bloc titre="Couleurs (tokens)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tokens.map((t) => (
            <div key={t.nom} className="flex items-center gap-3">
              <span
                className={`size-10 rounded-lg border border-bordure ${t.classe}`}
              />
              <code className="text-sm text-texte-attenue">{t.nom}</code>
            </div>
          ))}
        </div>
      </Bloc>

      <Bloc titre="Boutons">
        <div className="flex flex-wrap gap-3">
          <Bouton variante="primaire">Primaire</Bouton>
          <Bouton variante="secondaire">Secondaire</Bouton>
          <Bouton variante="fantome">Fantôme</Bouton>
          <Bouton variante="danger">Danger</Bouton>
          <Bouton variante="primaire" disabled>
            Désactivé
          </Bouton>
          <Bouton variante="secondaire" taille="sm">
            Petit
          </Bouton>
        </div>
      </Bloc>

      <Bloc titre="Étiquettes & pastilles">
        <div className="flex flex-wrap items-center gap-3">
          <Etiquette variante="accent">À venir</Etiquette>
          <Etiquette variante="succes">En cours</Etiquette>
          <Etiquette variante="neutre">Clôturée</Etiquette>
          <Etiquette variante="danger">Chute</Etiquette>
          <span className="mx-2 h-6 w-px bg-bordure" />
          <span className="flex items-center gap-1.5 text-sm">
            <Pastille variante="succes" libelle="complet" /> Complet
          </span>
          <span className="flex items-center gap-1.5 text-sm">
            <Pastille variante="attention" libelle="partiel" /> Partiel
          </span>
          <span className="flex items-center gap-1.5 text-sm">
            <Pastille variante="danger" libelle="erreur" /> Erreur
          </span>
        </div>
      </Bloc>

      <Bloc titre="Champs de saisie">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            id="demo-voie"
            label="Voie (points)"
            tonLabel="accent"
            type="number"
            inputMode="numeric"
            placeholder="pts"
            indice="Score cumulé sur la voie."
          />
          <ChampTexte
            id="demo-temps"
            label="Temps"
            inputMode="numeric"
            placeholder="8″12"
            erreur="Un temps doit être strictement positif."
          />
          <ChampSelect
            id="demo-club"
            label="Club"
            placeholder="Sélectionnez un club…"
            options={[
              { value: 'a', label: 'Vertical Mérignac' },
              { value: 'b', label: 'Grimpe Pessac' },
            ]}
            indice="Menu natif rendu en sombre (color-scheme)."
          />
          <ChampSelect
            id="demo-role"
            label="Rôle"
            tonLabel="accent"
            defaultValue="coach"
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'coach', label: 'Coach' },
            ]}
          />
        </div>
      </Bloc>

      <Bloc titre="Tableau">
        <Tableau>
          <TeteTableau>
            <tr>
              <CelluleTete>Grimpeur</CelluleTete>
              <CelluleTete>Club</CelluleTete>
              <CelluleTete>Statut</CelluleTete>
            </tr>
          </TeteTableau>
          <CorpsTableau>
            <LigneTableau>
              <Cellule className="font-medium text-texte-fort">
                Enzo Perrin
              </Cellule>
              <Cellule className="text-texte-attenue">Vertical Mérignac</Cellule>
              <Cellule>
                <Etiquette variante="succes">Saisi</Etiquette>
              </Cellule>
            </LigneTableau>
            <LigneTableau>
              <Cellule className="font-medium text-texte-fort">
                Sofia Dumas
              </Cellule>
              <Cellule className="text-texte-attenue">Grimpe Pessac</Cellule>
              <Cellule>
                <Etiquette variante="neutre">En attente</Etiquette>
              </Cellule>
            </LigneTableau>
          </CorpsTableau>
        </Tableau>
      </Bloc>
    </div>
  )
}
