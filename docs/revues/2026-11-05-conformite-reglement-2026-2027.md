# Conformité au règlement Interclubs 2026-2027 — 2026-11-05

- **Périmètre** : règlement jeunes et addendum adultes 2026-2027 comparés aux
  versions 2025-2026, puis aux specs (`docs/specs/`), au domaine
  (`src/domaine/`) et aux gabarits SQL (`supabase/migrations/`), branche
  `develop` (commit `2b0dc34`, v2.0.0).
- **Sources** : `docs/reglement/2027 Interclubs - Reglement v3.pdf` et
  `docs/reglement/2027 Interclubs - Reglement Adultes.pdf`.
- **Méthode** : extraction texte (`pdftotext -enc UTF-8 -layout` et `-table`),
  diff ligne à ligne avec les PDF 2025-2026, puis contrôle de chaque règle et de
  chaque barème.
- **Statut** : clos le 2026-11-05. 4.1 : seuil adulte de 16 ans conservé
  (justification de la spec #20 réécrite) ; 4.2 : sources des specs alignées sur
  2026-2027 ; 4.3 : PDF 2027 versionnés. 4.4 et 4.5 : sans suite.

## Verdict

**L'application est en phase.** Aucun barème n'a changé. Le seul changement qui
a un effet métier (les années de naissance) est déjà couvert par la v2.0.0
livrée aujourd'hui (`AGE_BASCULE=12`, `AGE_ADO_MAX=18`). Il reste une
justification à revoir (âge adulte) et des références de sources à mettre à jour.

## 1. Changements du règlement jeunes (2025-2026 → 2026-2027)

| Point | 2025-2026 | 2026-2027 | Impact appli |
|---|---|---|---|
| Saison | 2025-2026 | 2026-2027 | aucun (saison calculée, spec #1 R37) |
| Année pivot (matin ET après-midi) | nés en 2012 | nés en **2014** | ✅ couvert : 2026 − 2014 = 12 = `AGE_BASCULE` |
| Tranche 13/19 ans | nés de 2006 à 2012 | nés de **2008 à 2014** | ✅ couvert : 2026 − 2008 = 18 = `AGE_ADO_MAX` ; né en 2007 refusé |
| Remboursement du club d'accueil | 80 € | **40 € par demi-journée** | aucun (finances hors appli) |
| Pied de page, mise en forme, page 9 vide supprimée | — | — | aucun |

Tout le reste est identique mot pour mot (vérifié par le diff).

## 2. Changements de l'addendum adultes

| Point | 2025-2026 | 2026-2027 | Impact appli |
|---|---|---|---|
| Gratuité | « U18 qui auront participé l'après-midi » | « **U19** … » | ⚠️ voir §4 (justification de l'âge adulte) |
| Remboursement | — | 40 € par interclub adulte | aucun |
| Tableaux (voies, blocs 2 et 5, vitesse) | — | identiques (vérifié en mode `-table`) | aucun |

## 3. Barèmes : règlement 2026-2027 et appli

Tous conformes :

- **Matin, voies** M1–M4 = 1–4 pts ; T1–T10 = 5–14 pts ; prise valorisée
  3,3,4,4,5,5,6,6,7,8 → gabarit enfant (`000000000000_base_archivee.sql` l.1587–1936).
- **Matin, blocs** B1 4/3 (2 essais), B2 6/5/4 (3 essais) → paliers « par essai » (l.1989–1997).
- **Matin, vitesse** 15→11, puis 10…3 par tranches de 5, au-delà de 45 = 2, chute 1, NP 0
  → `202609221500_bareme_vitesse.sql`.
- **Après-midi, voies** T1–T10 : zone 1/zone 2/top 1/2/4 … 19/20/22 → l.1947–1949.
- **Après-midi, blocs** B1 10/30, B2 20/40/60 → l.2004–2011.
- **Après-midi, vitesse** 60→56, 55→11 (rangs 6–50), au-delà = 10, chute 5, NP 0 → conforme.
- **Adultes** voies T1–T10 (mêmes points), moulinette = moitié du top sans zone
  (spec #20 R25), B1 15/30, B2 20/50/70 (variante 2 blocs ; la variante 5 blocs se
  configure, R8), vitesse 100/95/90/85/80 puis 75/60/45/30/15 par tranches de 5,
  au-delà = 10, chute 5, NP 0 → `202610231000_categorie_adulte.sql`.
- Règles inchangées et couvertes : 3 voies par groupe de départ (matin), 6 voies
  max en ado/adulte, un essai par voie, zones non cumulables, classement vitesse
  par sexe, ex aequo (spec #7 R8), classement individuel et par club (§8).

## 4. Points d'attention

1. **Âge minimum adulte (16 ans), justification devenue fausse** —
   `docs/specs/20-categorie-adulte.md:13` justifie le seuil de 16 ans par « la
   catégorie U18 de l'addendum ». L'addendum 2026-2027 parle désormais de **U19**
   (les jeunes jusqu'à 18 ans, soit la tranche ado, qui ont participé
   l'après-midi). Le seuil `AGE_ADULTE_MIN = 16` (`src/domaine/rencontre.ts`)
   reste une **décision produit** que le règlement ne contredit pas (il ne fixe
   aucun âge minimum adulte). **Décision à prendre** : garder 16 ans en
   rattachant la justification à la décision du 2026-10-23, ou changer le seuil
   (révision de spec #20 R2 selon la règle de changement).
2. **Sources des specs** encore sur 2025-2026 : #1 (l.5), #2 (l.13), #3
   (l.261, 270), #5 (l.38), #6 (l.52), #7 (l.25, 61), #10 (l.59), #15 (l.10),
   #20 (l.8–10). Le contenu cité est inchangé (paragraphes et pages identiques :
   vitesse matin p.5, ado p.8, §6, §8). Seuls l'intitulé et le nom des PDF sont à
   mettre à jour. Comme c'est un changement de spec, il se fait **après validation explicite**.
3. **PDF 2027 non suivis par git** : à committer avec la mise à jour des sources.
   Les PDF 2025 peuvent rester pour l'historique.
4. **Rappel règlement sur les licences** (inchangé) : sans licence FFME/FFCAM/UNSS,
   un jeune ne valide pas ses points. L'appli accepte des grimpeurs avec une licence
   **générée** (spec #3 R21d, #18), et ne vérifie donc pas ce point : le contrôle
   reste organisationnel. C'était déjà le cas en 2025-2026, ce n'est pas un écart nouveau.
5. Détail cosmétique : la maquette `src/app/templates/nuit/dashboard/page.tsx:26`
   affiche « Saison 2025-2026 » en dur (gabarit visuel, pas un écran métier).

## Suites proposées

1. Décider du seuil d'âge adulte (4.1).
2. Sur accord, mettre à jour les sources des specs (4.2) et committer les PDF
   2027 (4.3).
