# Cahier de test : Export PDF des classements officiels (spec #15)

> Couvre l'action **« Exporter en PDF »** des écrans de classement admin et
> coach, et les points d'accès `/admin/rencontres/[id]/classement/pdf` et
> `/coach/rencontres/[id]/classement/pdf` : disponibilité en **⑤ uniquement**
> (R1/R2), accès **admin** et **coach permanent de club engagé** (R3–R5),
> document **identique** pour tous (R6), téléchargement direct et nommage
> (R7–R9), **contenu** et **mise en page** du PDF (R10–R20). Règles :
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/15-export-pdf-classements.md` (R1–R20) ;
  `docs/specs/07-classement.md` (source du classement, R7/R8/R8b) ;
  `docs/specs/01-roles-et-autorisations.md` (R5/R8/R9, phases).
- **Couvert par Vitest** (non rejoué ici) : éligibilité R1–R5
  (`src/domaine/export-classement.test.ts`), nom de fichier R9, modèle du
  document R10–R16 (en-tête, ordre des sections, colonnes, comptes, « Aucun
  classement », scores sans arrondi) ; structure du PDF R12/R16/R17/R18
  (`src/lib/export/rendu-pdf.test.ts` : A4, une page par section, section longue
  multi-pages, caractère hors police). Ce cahier vérifie **le réel** : gardes
  serveur, présence du bouton, téléchargement, **rendu visuel** du PDF et
  **fidélité** aux données de la base.
- **Pré-requis** :
  - Mêmes migrations que le cahier **18-classement** (jusqu'à
    `202609221600_points_vitesse_trigger` incluse). **Aucune migration** propre
    à cette spec. En local : `supabase db reset`.
  - `SUPABASE_SERVICE_ROLE_KEY` renseignée (assemblage cross-club, ADR 0002/0003).
  - App lancée : `npm run dev`. Un lecteur PDF (navigateur ou Acrobat).
- **Environnement** : local (stack Docker) / recette — version/commit : `______`

## Jeu de données initial

Seed `01-jeu-de-test.sql` (catalogue
[00-catalogue-jeux-de-donnees.md](00-catalogue-jeux-de-donnees.md)) :

- **JD-RENCONTRE-ENFANT** (`33333333-…-3333`, 19/09/2026, club porteur **Club A**)
  avec **JD-EQUIPE-A1** (Ana F, Bob H), **JD-EQUIPE-A2** (Devi H, prêté Club B)
  et **JD-EQUIPE-B1** (Cléo F) → clubs engagés : **Club A** et **Club B**.
- **JD-RENCONTRE-ADO** (`adadadad-…`) avec **JD-EQUIPE-ADO** (Club A seul) →
  **Club B non engagé** (négatif R4).

**Saisies à faire en ③** (écran de saisie, spec #6) sur la rencontre enfant :

| Grimpeur | Résultats à saisir | Score attendu |
| -------- | ------------------- | -------------- |
| Bob (H, A1) | T1 = Top, B1 = 1er essai | **9** |
| Cléo (F, B1) | T2 = Top, B2 = 1er essai | **12** |
| Ana (F, A1) | M2 = Top, B1 = 1er essai | **9** |
| Devi (H, A2, prêté) | aucun | **0** |

Puis faire passer la rencontre enfant en **④ clôture** puis **⑤ résultats
publics** (`/admin/rencontres/33333333-…-3333`). Relever sur l'écran de
classement admin les rangs et scores des trois vues : c'est la **référence** du
PDF (R13).

## Comptes de test

| Compte | Rôle | Usage |
| ------ | ---- | ----- |
| JD-ADMIN (`admin@test.local`) | admin | Export de toute rencontre en ⑤ ; change les phases |
| JD-COACH-A (`coach@test.local`) | coach permanent Club A | Export (club engagé) ; comparaison avec l'admin (R6) |
| JD-COACH-B (`coachb@test.local`) | coach permanent Club B | Engagé en enfant, **non engagé** en ado (R4) |
| JD-SANSMAP (`sansmapping@test.local`) | authentifié sans rôle | Négatif (R5) |
| JD-JETON-COACHTEMP / JD-JETON-JUGE | sessions QR | Négatif (R5) |

## Cas de test

> **Exécution automatique** : `e2e/export-pdf.spec.ts` rejoue la part machine
> de CT-01 (nom du fichier téléchargé), CT-04 (bouton et PDF pour les deux
> coachs), CT-05, CT-06 et CT-07 (bouton absent, URL directe en **404**).
> **Résidus manuels** : rendu du PDF et identité des documents (CT-02, CT-03,
> CT-04 étape 3, CT-08 → CT-10), cible tactile du bouton, session coach
> temporaire (CT-07 cas 4).

### CT-01 — Export par l'admin : bouton et téléchargement (couvre R3, R7, R8, R9)

- **Rôle** : JD-ADMIN.
- **Pré-condition** : rencontre enfant en ⑤, saisies faites.
- **Étapes** :
  1. Ouvrir `/admin/rencontres/33333333-…-3333/classement`.
  2. Repérer le bouton **« ⤓ Exporter en PDF »** sous les étiquettes de phase.
  3. Cliquer dessus.
- **Résultat attendu** : le navigateur **télécharge** directement un fichier
  nommé **`classement-2026-09-19-enfant.pdf`**, sans page intermédiaire ni boîte
  d'impression. Le bouton est une cible tactile d'au moins 44 px de haut
  (vérifier aussi sur téléphone).

### CT-02 — En-tête et pied de page du document (couvre R10, R17, R19)

- **Pré-condition** : fichier de CT-01.
- **Étapes** :
  1. Ouvrir le PDF.
- **Résultat attendu** :
  - format **A4 portrait** (propriétés du document : 210 × 297 mm) ;
  - page 1, en-tête : **« Classement officiel »**, puis « 19 septembre 2026 ·
    Catégorie Enfant · Club porteur : Club A », puis « Document généré le
    *jour* à *HH:MM* » à l'**heure de Paris** du téléchargement ;
  - **chaque page** porte en pied « 19 septembre 2026 · Enfant » à gauche et
    « Page *n* / *N* » à droite, *N* = nombre total de pages (ici **4**).

### CT-03 — Sections, ordre, colonnes et fidélité aux données (couvre R11, R12, R13, R15)

- **Pré-condition** : fichier de CT-01 et référence relevée à l'écran.
- **Étapes** :
  1. Parcourir le PDF page par page.
- **Résultat attendu** :
  - 4 sections, **chacune en haut d'une nouvelle page**, dans l'ordre :
    **Individuel Filles** (p. 1, sous l'en-tête), **Individuel Garçons** (p. 2),
    **Équipes** (p. 3), **Clubs** (p. 4) ; chacune avec son compte
    (« 2 grimpeuses », « 2 grimpeurs », « 3 équipes », « 2 clubs ») ;
  - Filles : `1 · Bravo Cléo · Club B · 12` puis `2 · Alpha Ana · Club A · 9` ;
  - Garçons : `1 · Alpha Bob · Club A · 9` puis `2 · … Devi · Club B · 0` —
    Devi apparaît sous son **club d'origine** Club B (spec #7 R7) ;
  - Équipes : colonnes Rang / Équipe / Club / Score ; A1 = **18**, B1 = **12**,
    A2 = **0** (Devi compte pour son équipe d'accueil A2) ;
  - Clubs : colonnes Rang / Club / Score ; Club A = **18**, Club B = **12** ;
  - **rangs, ordre et scores identiques** à l'écran de classement (référence).

### CT-04 — Export par un coach de club engagé, document identique (couvre R4, R6, R7)

- **Rôle** : JD-COACH-A puis JD-COACH-B.
- **Étapes** :
  1. JD-COACH-A : ouvrir `/coach/rencontres/33333333-…-3333/classement`,
     cliquer « Exporter en PDF ».
  2. JD-COACH-B : même opération.
  3. Comparer les deux fichiers avec celui de l'admin (CT-01).
- **Résultat attendu** : le bouton est présent pour les deux coachs (Club A et
  Club B sont engagés) ; les trois PDF ont le **même contenu** (hors heure de
  génération) : classement complet tous clubs, **aucune mise en évidence** du
  club du coach, aucun filtre.

### CT-05 — Pas d'export avant la ⑤ (couvre R1, R2)

- **Rôle** : JD-ADMIN puis JD-COACH-A.
- **Étapes** :
  1. Repasser la rencontre enfant en **④ clôture**.
  2. Ouvrir l'écran de classement admin, puis coach.
  3. Saisir directement dans la barre d'adresse
     `/admin/rencontres/33333333-…-3333/classement/pdf` (admin) et
     `/coach/rencontres/33333333-…-3333/classement/pdf` (coach).
  4. Remettre la rencontre en **⑤** et recharger l'écran.
- **Résultat attendu** : étapes 2–3 : **aucun bouton** d'export ; les URL
  directes répondent **404**, aucun fichier téléchargé. Étape 4 : le bouton
  **réapparaît**.
- **Variante** : rencontre en **③** → même résultat que l'étape 2–3.

### CT-06 — Coach d'un club non engagé (couvre R4)

- **Rôle** : JD-COACH-B.
- **Pré-condition** : passer **JD-RENCONTRE-ADO** en ⑤ (via ④) avec JD-ADMIN.
- **Étapes** :
  1. Ouvrir `/coach/rencontres/adadadad-…/classement`.
  2. Ouvrir directement `/coach/rencontres/adadadad-…/classement/pdf`.
- **Résultat attendu** : le classement reste **consultable** (spec #7 R11) mais
  **sans bouton** d'export ; l'URL directe répond **404**.
- **Contrôle positif** : JD-COACH-A (Club A engagé) voit le bouton et télécharge
  `classement-2026-09-19-ado.pdf`.
- **Nettoyage** : remettre JD-RENCONTRE-ADO en `competition` (SQL).

### CT-07 — Rôles sans accès (couvre R5)

- **Pré-condition** : rencontre enfant en ⑤.
- **Étapes** (URL `…/classement/pdf` saisie directement, espace admin **et**
  espace coach) :
  1. **Déconnecté** (fenêtre privée).
  2. Connecté **JD-SANSMAP**.
  3. Connecté **JD-COACH-A** sur l'URL **admin**
     `/admin/rencontres/33333333-…-3333/classement/pdf`.
  4. Session **coach temporaire** (scan JD-JETON-COACHTEMP, fait en ③ avant le
     passage en ⑤) puis ouverture de l'URL coach une fois la rencontre en ⑤.
- **Résultat attendu** : **404** dans tous les cas, aucun fichier. (Cas 4 : la
  session temporaire est de toute façon invalide dès la ④, spec #1 R9.)

### CT-08 — Section vide conservée (couvre R16)

- **Pré-condition** : sur JD-RENCONTRE-ADO en ⑤ (CT-06), aucune grimpeuse n'est
  engagée **ou** retirer temporairement les filles de la composition avant la ⑤.
- **Étapes** :
  1. En admin, exporter le PDF de la rencontre concernée.
- **Résultat attendu** : la section **Individuel Filles** est présente (titre,
  « 0 grimpeuse ») avec la mention **« Aucun classement »** ; les quatre sections
  restent présentes.

### CT-09 — Section longue et répétition de l'en-tête de colonnes (couvre R14, R18)

- **Pré-condition** : une rencontre en ⑤ avec **plus de 45 grimpeurs** d'un même
  sexe (ex. données de recette après import des licenciés, spec #13, ou
  duplication via le pool JD-POOL-LIBRES sur plusieurs équipes).
- **Étapes** :
  1. Exporter le PDF ; aller à la section concernée.
- **Résultat attendu** : le tableau **continue** sur la page suivante, avec un
  rappel « *Titre* (suite) » et l'**en-tête de colonnes répété** ; **toutes**
  les lignes figurent (compte de la section = nombre de lignes), sans
  pagination ni filtre appliqué ; aucune ligne ne chevauche le pied de page.

### CT-10 — Caractères français et texte sélectionnable (couvre R20)

- **Pré-condition** : renommer temporairement un grimpeur engagé en
  **« D'Aubigné-Lefèvre »**, prénom **« Maëlle »**, et un club en
  **« Œuvre Escalade Côte »** (écrans admin grimpeurs / clubs).
- **Étapes** :
  1. Exporter le PDF.
  2. Sélectionner le nom dans le lecteur PDF et le coller dans un éditeur.
- **Résultat attendu** : noms rendus **à l'identique** (accents, cédille,
  apostrophe, trait d'union, œ) ; le texte est **sélectionnable** et le collage
  restitue le même texte. Un nom trop long pour sa colonne est **tronqué avec
  « … »** sans déborder sur la colonne voisine.
- **Nettoyage** : restaurer les noms d'origine.

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| | | | CT-01 | ✅ / ❌ | |
| | | | CT-02 | ✅ / ❌ | |
| | | | CT-03 | ✅ / ❌ | |
| | | | CT-04 | ✅ / ❌ | |
| | | | CT-05 | ✅ / ❌ | |
| | | | CT-06 | ✅ / ❌ | |
| | | | CT-07 | ✅ / ❌ | |
| | | | CT-08 | ✅ / ❌ | |
| | | | CT-09 | ✅ / ❌ | |
| | | | CT-10 | ✅ / ❌ | |
