import {
  Carte,
  Cellule,
  CelluleTete,
  CorpsTableau,
  EnTetePage,
  Etiquette,
  LigneTableau,
  Tableau,
  TeteTableau,
  TitreSection,
  type VarianteEtiquette,
} from '@/composants'

import { clubs, rencontres, statsAdmin } from '../../_data'

const statut: Record<string, VarianteEtiquette> = {
  'À venir': 'accent',
  'En cours': 'succes',
  Clôturée: 'neutre',
}

export default function DashboardNuit() {
  return (
    <div>
      <EnTetePage titre="Tableau de bord" sousTitre="Saison 2025-2026 · Comité 33" />

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statsAdmin.map((s) => (
          <Carte key={s.label} className="p-4">
            <p className="bg-gradient-to-r from-accent-doux to-secondaire bg-clip-text text-3xl font-bold text-transparent">
              {s.valeur}
            </p>
            <p className="mt-1 text-sm font-medium text-texte">{s.label}</p>
            <p className="text-xs text-texte-doux">{s.detail}</p>
          </Carte>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <TitreSection>Rencontres</TitreSection>

          {/* Cartes empilées < md */}
          <div className="mt-3 space-y-2 md:hidden">
            {rencontres.map((r) => (
              <Carte key={r.id} className="flex items-center gap-4 p-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface text-xs font-bold text-accent-doux ring-1 ring-bordure">
                  {r.date.split(' ')[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-texte-fort">
                    {r.domicile}{' '}
                    <span className="text-texte-doux">vs</span> {r.visiteur}
                  </p>
                  <p className="truncate text-sm text-texte-attenue">
                    {r.categorie}
                  </p>
                </div>
                <Etiquette variante={statut[r.statut]}>{r.statut}</Etiquette>
              </Carte>
            ))}
          </div>

          {/* Tableau ≥ md */}
          <div className="mt-3 hidden md:block">
            <Tableau>
              <TeteTableau>
                <tr>
                  <CelluleTete>Date</CelluleTete>
                  <CelluleTete>Affiche</CelluleTete>
                  <CelluleTete>Catégorie</CelluleTete>
                  <CelluleTete>Statut</CelluleTete>
                </tr>
              </TeteTableau>
              <CorpsTableau>
                {rencontres.map((r) => (
                  <LigneTableau key={r.id}>
                    <Cellule className="text-texte-attenue">{r.date}</Cellule>
                    <Cellule className="font-medium text-texte-fort">
                      {r.domicile} <span className="text-texte-doux">vs</span>{' '}
                      {r.visiteur}
                    </Cellule>
                    <Cellule className="text-texte-attenue">
                      {r.categorie}
                    </Cellule>
                    <Cellule>
                      <Etiquette variante={statut[r.statut]}>
                        {r.statut}
                      </Etiquette>
                    </Cellule>
                  </LigneTableau>
                ))}
              </CorpsTableau>
            </Tableau>
          </div>
        </section>

        <section>
          <TitreSection>Clubs</TitreSection>
          <div className="mt-3 space-y-2">
            {clubs.map((c) => (
              <Carte
                key={c.nom}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="font-medium text-texte-fort">{c.nom}</p>
                  <p className="text-xs text-texte-doux">{c.equipes} équipes</p>
                </div>
                <span className="font-mono text-sm font-semibold text-secondaire">
                  {c.grimpeurs}
                </span>
              </Carte>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
