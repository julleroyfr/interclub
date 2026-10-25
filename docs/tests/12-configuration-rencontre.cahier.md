# Cahier de test : Tableau de bord d'une rencontre (spec #3, R40–R45)

> Couvre l'écran **`/admin/rencontres/[id]`**, le **tableau de bord** d'une
> rencontre : en-tête à **titre dynamique**, **pilotage de phase** (R41a), accès
> aux **jetons QR** (R41b), **structure** en onglets (R42–R45, ajout réservé à
> la pré-compétition ; modification et suppression en ① et ②, R51–R55) et **équipes** regroupées par club en blocs repliables
> (R41c). Complète le cahier
> [11-gabarit-rencontre.cahier.md](11-gabarit-rencontre.cahier.md)
> (CT-09/CT-10) en détaillant l'IHM dédiée.
> Règles : [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md) ;
> IHM : [08-ihm-responsive.md](../conventions/08-ihm-responsive.md).

- **Spec de référence** : `docs/specs/03-ecrans-de-parametrage-admin.md`
  (Configuration d'une rencontre R40–R45 ; niveaux R37 ; points R38 ; phase R36 ;
  repère et libellé des voies R49/R50, ajout du 2026-10-16 ; modification et
  suppression des éléments R51–R55, ajout du 2026-10-25) ;
  `docs/specs/01-roles-et-autorisations.md` (R12 : écriture réservée à l'admin).
- **Domaine** : `src/domaine/gabarit.ts` (`validerNiveauVoie` plages R37,
  `validerPoints` R38, `champsPointsVoie` champs conditionnels R38/R43 —
  couverts par `gabarit.test.ts`, 22 tests Vitest) ; `src/domaine/voie.ts`
  (`normaliserRepereVoie` R49a/b, `repereModifiable` R49d, `libellesVoies` R50 —
  couverts par `voie.test.ts`) ; `src/domaine/structure.ts`
  (`editionStructurePossible` / `ajoutStructurePossible` R51,
  `refusModificationVoie` R55b, `refusSuppression` R55a/c, `normaliserCodeBloc` /
  `normaliserLibellePalier` R53 — couverts par `structure.test.ts`).
- **Data / actions** : `src/lib/rencontres/structure.ts` (`getStructureRencontre`) ;
  `src/lib/rencontres/structure-actions.ts` (`ajouterEpreuveRencontre`,
  `ajouterVoieDifficulteRencontre`, `ajouterBlocRencontre`,
  `ajouterVoieVitesseRencontre` — garde admin + phase pré-compétition ;
  `modifierRepereVoie` — garde admin + phases ① à ③, R49d ;
  `modifierVoieDifficulteRencontre`, `supprimerVoieDifficulteRencontre`,
  `modifierCodeBlocRencontre`, `supprimerBlocRencontre`,
  `ajouterPalierBlocRencontre`, `modifierPalierBlocRencontre`,
  `supprimerPalierBlocRencontre`, `supprimerVoieVitesseRencontre`,
  `modifierLibelleVoieVitesseRencontre` — garde admin + phases ① et ②, R51).
- **IHM** : `src/app/admin/rencontres/[id]/page.tsx` (garde admin, chargement,
  en-tête à titre dynamique, mise en page tableau de bord — cf. maquette
  `docs/maquettes/rencontre-dashboard.html`) ; `panneau-pilotage.tsx` (phase R41a
  et lien QR R41b) ; `panneau-structure.tsx` (onglets, formulaires, lecture seule,
  état vide) ; `panneau-equipes.tsx` (blocs par club repliables R41c) ; action
  d'ouverture du tableau de bord dans `liste-rencontres.tsx`.
- **Phase (réutilisé)** : `changerPhaseRencontre` (`src/lib/rencontres/actions.ts`)
  et helpers domaine `phaseSuivante` / `phasePrecedenteEffective` /
  `peutEntrerEnPhase` (`src/domaine/rencontre.ts`, garde jour J R5) — déjà
  couverts par Vitest.
- **Migration** : aucune nouvelle (réutilise les tables `epreuve`,
  `voie_difficulte`, `bloc`, `bloc_palier`, `voie_vitesse` du gabarit —
  `202607291000_gabarit_et_voies_epreuve.sql`, **déjà appliquée**). **CT-18** :
  migration `202610161100_repere_voie.sql` (colonne `voie_difficulte.repere`,
  check ≤ 30 car., index unique partiel par épreuve/niveau) **à appliquer à la
  main** avant le cas.
- **Pré-requis** :
  - Migrations + seed `01-jeu-de-test.sql` chargés ; migration gabarit appliquée.
  - Seed gabarit présent : enfant (14 voies diff, 2 blocs, Filles/Garçons),
    ado (10 voies diff en tête, 2 blocs, Filles/Garçons).
  - Comptes (mdp `interclub`) : `admin@test.local` (admin),
    `coach@test.local` (coach Club A).
  - Au moins une rencontre **ado** et une rencontre **enfant** en phase
    pré-compétition (créées via `/admin/rencontres`, gabarit copié — cf.
    cahier 11 CT-06).
  - App lancée : `npm run dev`.
- **Environnement** : local et/ou recette — version/commit : `______`

## Accès

Connecté **admin** : `/admin/rencontres` → sur une ligne de rencontre, l'action
d'ouverture du **tableau de bord** → `/admin/rencontres/<id>`.

## Cas de test

### CT-01 — Accès réservé à l'admin (couvre R40, R12)

- **admin** : depuis `/admin/rencontres`, ouvrir le **tableau de bord** d'une
  rencontre → l'écran `/admin/rencontres/<id>` s'affiche. ✅
- **coach** (`coach@test.local`) : ouvrir directement l'URL
  `/admin/rencontres/<id>` → **404** (écran masqué). ✅
- **non connecté** : `/admin/rencontres/<id>` → **redirection vers `/connexion`** (spec #12 R2).
- **id inexistant** : admin ouvre `/admin/rencontres/<uuid-bidon>` → **404**.

### CT-02 — En-tête, onglets et compteurs (couvre R41, R42)

- **Rôle** : admin. **Pré-condition** : rencontre **ado** au format seed.
- **Étapes** : ouvrir le tableau de bord de la rencontre.
- **Résultat attendu** :
  - **Titre dynamique** : « **Rencontre &lt;club porteur&gt; du &lt;date&gt;** »
    (date en format long).
  - En-tête : **catégorie** (« Ado »), **club porteur**, **badge de phase**
    « Pré-compétition » et **compteurs** (équipes, épreuves).
  - Trois onglets : **Voies de difficulté · 10**, **Blocs · 2**,
    **Vitesse · 2** (compteurs conformes au contenu copié).
  - Un seul onglet visible à la fois ; cliquer un onglet change le contenu.
  - Onglet Voies : liste T1–T10 avec type, cotation et points (voie + Z1/Z2).
  - Onglet Blocs : B1/B2 avec leurs **paliers** (libellé + points).
  - Onglet Vitesse : voies numérotées **Filles** / **Garçons**.

### CT-03 — Ajouter une voie de difficulté en pré-compétition (couvre R43, R36)

- **Rôle** : admin. **Pré-condition** : rencontre **ado**, onglet **Voies**.
- **Étapes** : niveau **T6**, type **Tête**, cotation « 6c », points voie 14,
  Zone 1 = 11, Zone 2 = 12 → **+ Voie**.
- **Résultat attendu** : message « Voie ajoutée. » ; une **2ᵉ voie T6** apparaît
  (niveau non unique autorisé) ; le compteur de l'onglet passe à **11**. Le
  gabarit ado et les autres rencontres ne sont pas modifiés (R36).

### CT-04 — Champs de points conditionnels à la catégorie (couvre R38, R43)

- **Rôle** : admin. **Étapes** : comparer le formulaire d'ajout de voie sur une
  rencontre **ado** puis **enfant**.
- **Résultat attendu** :
  - **Ado** : champs **Voie entière**, **Zone 1**, **Zone 2** (pas de prise
    valorisée).
  - **Enfant** : champs **Voie entière** et **Prise valo.** (pas de zones).
  - Sur une rencontre enfant, ajouter une voie **moulinette** M2 (points voie
    seulement) : la prise valorisée saisie est ignorée (null en base pour une
    moulinette). Points négatif/décimal **refusé** (« entier positif ou nul »).

### CT-05 — Niveau hors plage réglementaire refusé (couvre R37)

- **Rôle** : admin. **Étapes / Résultat attendu** :
  1. Rencontre **ado** → le sélecteur Type ne propose **que « Tête »** ; le
     sélecteur Niveau ne propose que T1–T10 (pas de moulinette, pas de T11).
  2. Contournement (forcer `typeVoie=moulinette` ou `niveau=T11` via l'action) →
     **refus** avec message de niveau invalide ; aucune voie créée.

### CT-06 — Ajouter un bloc (couvre R43, R42)

- **Rôle** : admin. **Pré-condition** : rencontre ado, onglet **Blocs**.
- **Étapes** : code « B3 » → **+ Bloc**. Puis retenter « B1 ».
- **Résultat attendu** : « B3 » apparaît (compteur **3**) ; le bloc s'affiche
  sans palier (« Aucun palier. »). Ajouter un code **déjà présent** (« B1 ») →
  refus « Le bloc « B1 » existe déjà. » (unicité `(épreuve, code)`).

### CT-07 — Ajouter une voie de vitesse (couvre R43, R32)

- **Rôle** : admin. **Pré-condition** : onglet **Vitesse**.
- **Étapes** : libellé **« Mixte »** (suggestions Filles/Garçons/Mixte) →
  **+ Voie**.
- **Résultat attendu** : « Mixte » s'ajoute avec le **numéro suivant** à côté de
  Filles/Garçons (compteur **3**). Un libellé **vide** est refusé.

### CT-08 — Structure verrouillée hors pré-compétition (couvre R44, R36)

- **Rôle** : admin. **Pré-condition** : faire avancer la rencontre en
  **compétition** (`/admin/rencontres`).
- **Étapes** : rouvrir l'écran de configuration.
- **Résultat attendu** :
  - Badge de phase « Compétition » ; **message** indiquant que la structure est
    **verrouillée** (modifiable uniquement en pré-compétition).
  - **Aucun formulaire** d'ajout dans les onglets ; les listes restent
    **consultables**.
  - Contournement : invoquer directement `ajouterVoieDifficulteRencontre` →
    refus « La structure ne peut être modifiée qu'en phase pré-compétition. » (R36)

### CT-09 — Rencontre sans format : ajout d'épreuve d'abord (couvre R45, R35)

- **Rôle** : admin. **Pré-condition** : une rencontre **sans épreuve** (créée
  sur gabarit vidé — cf. cahier 11 CT-08 ; restaurer le seed ensuite).
- **Étapes** :
  1. Ouvrir l'écran → onglets à **0**.
  2. Onglet **Voies** : état vide « Aucune épreuve… » + bouton
     **« + Ajouter l'épreuve »** → cliquer.
  3. Puis ajouter une voie T1 dans l'onglet désormais actif.
- **Résultat attendu** : l'épreuve « voie » est créée (« Épreuve ajoutée. »),
  puis le formulaire d'ajout de voie apparaît et la voie s'ajoute (R43).

### CT-10 — Refus d'un doublon d'épreuve (couvre R45)

- **Rôle** : admin. **Pré-condition** : rencontre au format seed (épreuve voie
  déjà présente).
- **Étapes** : forcer l'ajout d'une **2ᵉ épreuve de type « voie »** (l'UI ne le
  propose pas quand l'épreuve existe ; invoquer `ajouterEpreuveRencontre` avec
  `type=voie`).
- **Résultat attendu** : refus « Cette épreuve existe déjà. » ; une seule épreuve
  par type subsiste.

### CT-11 — Garde serveur : un coach ne peut pas écrire (couvre R40, R12 ; contournement)

- **Objet** : les Server Actions ne se fient pas à l'UI. Connecté **coach**,
  invoquer directement `ajouterEpreuveRencontre` / `ajouterVoieDifficulteRencontre`
  / `ajouterBlocRencontre` / `ajouterVoieVitesseRencontre`, ou tenter un `insert`
  sur `epreuve` / `voie_difficulte` / `bloc` / `voie_vitesse` via l'API REST.
- **Résultat attendu** : **refus** (garde admin + RLS). Aucune écriture.

### CT-12 — Responsive & tactile (mobile-first, conv. 08)

- **Étapes** : sur téléphone (ou DevTools ~375 px) — dérouler CT-02, CT-03,
  CT-06, CT-07.
- **Résultat attendu** :
  - Barre d'onglets et boutons ≥ 44 px de haut ; onglets tactiles sans
    débordement ; libellés lisibles.
  - Champs (niveau, type, cotation, points) ≥ 44 px ; police 16 px (pas de zoom
    iOS au focus) ; `<select>` lisibles (fond sombre, `color-scheme: dark`).
  - Listes de voies/blocs empilées sans débordement horizontal ; focus clavier
    visible ; messages d'erreur/succès reliés (lecteur d'écran).

### CT-13 — Pilotage de phase depuis le tableau de bord (couvre R41a, R17, R5)

- **Rôle** : admin. **Pré-condition** : rencontre **ado**, phase
  **pré-compétition**, **datée du jour même**.
- **Étapes / Résultat attendu** :
  1. Le bloc **Phase** affiche le badge courant, le **fil des 5 phases** et les
     boutons **← / →**. Avancer → « Préparation » : le badge et le fil se
     mettent à jour (état à jour, R41a).
  2. Reculer → « Pré-compétition ». On **ne saute pas** de phase ; on ne recule
     pas avant la première ni n'avance après la dernière (boutons absents/inactifs
     aux extrémités).
  3. **Garde jour J (R5)** : sur une rencontre **non datée du jour**, le passage
     en **préparation** est **inactif** (info-bulle « le jour de la rencontre »).
     Cohérent avec la même commande sur la **liste** `/admin/rencontres` (R41a :
     seconde surface de la même action).
  4. Contournement : invoquer `changerPhaseRencontre` vers une phase **non
     adjacente** ou en préparation hors jour J → **refus** (garde autoritaire).
     *(Garde effective depuis le 2026-10-03 : l'action relit la phase en base et
     applique `peutTransiter`, couvert par Vitest — `rencontre.test.ts`,
     « peutTransiter (spec #3 R17) » ; scénario d'écran : CT-17.)*

### CT-14 — Lien vers les jetons QR de la rencontre (couvre R41b)

- **Rôle** : admin. **Étapes** : depuis le tableau de bord, activer le lien
  **« Jetons QR »**.
- **Résultat attendu** : redirection vers `/admin/jetons?rencontre=<id>`, la
  rencontre étant **déjà sélectionnée** (sections coach temporaire / juge
  affichées, spec #2). Retour au tableau de bord possible.

### CT-15 — Équipes regroupées par club, blocs repliés (couvre R41c)

- **Rôle** : admin. **Pré-condition** : une rencontre à **plusieurs clubs**
  engagés et une rencontre à **un seul club** engagé.
- **Résultat attendu** :
  - Plusieurs clubs : chaque club forme un **bloc repliable** avec ses
    **compteurs** (équipes, grimpeurs), **replié par défaut** ; on déplie/replie
    au clic.
  - Un seul club : son bloc est **ouvert d'office**.
  - Déplier un bloc montre les équipes du club (composition, effectif n/8, tag
    « Prêté » le cas échéant).

### CT-16 — Édition complète du barème de vitesse (couvre R46, R47, R48)

- **Rôle** : admin. **Pré-condition** : rencontre enfant en **① pré-compétition** ;
  onglet **Structure › Vitesse** → bloc **Barème par rang** (échelons éditables :
  rang min, rang max, points, décrément + bouton **＋ Ajouter un échelon** et **×**
  par ligne).
- **Étapes / résultat attendu (nominal)** :
  1. **Modifier un rang** : passer le rang max de l'échelon `1–5` à **4** et le rang
     min du suivant à **5** → **Enregistrer** → « Barème de vitesse mis à jour. » ;
     les rangs **persistent** après rechargement.
  2. **Ajouter** un échelon (bouton en bas), lui donner une plage contiguë valide
     avec un rang min « au milieu » (ex. `6–8`) → **Enregistrer** → la ligne se
     **replace par rang croissant** (re-tri à l'affichage) et persiste.
  3. **Supprimer** un échelon (**×**) puis compléter la couverture → **Enregistrer**
     → l'échelon disparaît, la couverture reste valide.
- **Refus (validation R48 — rien n'est enregistré, message précis)** — construire
  puis **Enregistrer** :
  - **Trou** : `1–5` puis `7 – et +` → « Trou de couverture entre les rangs 5 et 7 ».
  - **Chevauchement** : `1–5` et `4 – et +` → « Chevauchement… ».
  - **Dernier échelon borné** : aucune ligne « et + » (tous les rangs max remplis) →
    « Le dernier échelon doit être « au-delà »… ».
  - **Ne commence pas au rang 1** : premier échelon `2 – …` → « La couverture doit
    commencer au rang 1 ».
  Après chaque refus, **recharger** : le barème en base est **inchangé**.
- **Négatif rôle / phase** :
  - passer la rencontre en **③ compétition** → le barème passe en **lecture seule**
    (ni champs ni bouton) ; un appel direct à `mettreAJourBaremeVitesse` est refusé
    (« … qu'en phase pré-compétition », R44).
  - un **coach** (`coach@test.local`) n'accède pas à `/admin/rencontres/…` (404).
- **Rétablir** ensuite le barème enfant d'origine (`1–5` = 15 décr 1 … `46e et +` = 2,
  chute 1, NP 0) pour les autres cahiers.

### CT-17 `[auto]` — Changement de phase refusé depuis un écran périmé (couvre R17, R41a)

- **Rôle** : admin. **Pré-condition** : rencontre pilote `33333333-…` en **③
  compétition**, **datée du jour même**.
- **Étapes** :
  1. Ouvrir le tableau de bord : le bouton « ← » propose **Préparation**.
  2. Sans recharger, faire passer la rencontre en **④ clôture** par un autre
     moyen (second admin, ou SQL Editor).
  3. Cliquer « ← » (qui vise encore la ② préparation).
- **Résultat attendu** : **refus** avec le message « La rencontre est en phase
  « Clôture » : ce changement de phase n'est plus possible. Rechargez la page. » ;
  la rencontre **reste en ④** (aucun saut ④ → ②).
- **Automatisé** : `e2e/pilotage-phase.spec.ts` (`npm run test:cahier:phase`).

### CT-18 — Repère et libellé des voies doublées (couvre R49, R50 ; spec #6 R21)

- **Rôle** : admin, puis coach. **Pré-condition** : migration
  `202610161100_repere_voie` appliquée (vérifier :
  `select version from interclub.version where version = '202610161100_repere_voie';`
  → 1 ligne) ; une rencontre **ado** avec **deux voies T5** (au seed : rencontre
  ado `adadadad-…`, en ③ ; sinon ajouter une 2ᵉ T5 en ① via l'onglet Voies).
- **Étapes / résultat attendu** :
  1. **Lettres par défaut** (R50b/c) : onglet **Voies** → les deux T5 s'affichent
     **« T5 a »** et **« T5 b »** (dans l'ordre de la liste) ; les niveaux uniques
     restent seuls (« T6 »). ✅
     **Tri** (R42, rév. 2026-10-16) : la liste est triée **par niveau** (T1 → T10,
     et M1 → M4 d'abord en enfant) **puis par libellé** dans un niveau — ex.
     « T5 c », « T5 Jaune », « T5 Relais 12 », puis « T6 a ». ✅
  2. **Poser un repère en ③** (R49d, R50a) : sur la ligne « T5 b », saisir
     « Jaune » entouré d'espaces dans **Repère** → **OK** → « Repère enregistré. » ; la ligne
     devient **« T5 Jaune »** (espaces retirés) et l'autre reste **« T5 a »**
     (la lettre ne bouge pas). ✅
  3. **Doublon refusé** (R49c) : sur « T5 a », saisir `jaune` → **OK** → message
     « Une autre voie T5 porte déjà le repère « jaune » » ; rien n'est enregistré.
     Saisir `Jaune` sur **T6** → accepté (« T6 Jaune »), puis l'effacer (champ
     vide → **OK** → « Repère effacé. », retour à « T6 »). ✅
  4. **Trop long** (R49b) : coller 31 caractères via un appel direct (le champ
     bloque à 30) → refus « Le repère ne peut dépasser 30 caractères. ». ✅
  5. **Ajout avec repère** (R43, en ① sur une autre rencontre ado) : ajouter une
     voie T7 avec Repère `Relais 12` → la ligne affiche **« T7 Relais 12 »**. ✅
  6. **Côté coach** (spec #6 R21) : `coach@test.local` → saisie ado d'un grimpeur
     → le choix **Ajouter une voie** propose **« T5 a (…) »** et **« T5 Jaune
     (…) »** ; après une saisie, la ligne et le **récapitulatif** affichent le même
     libellé. Même libellé dans la **saisie admin** (spec #9), le **contrôle**
     (spec #16, rencontre en ④), la **décomposition du classement** et le **PDF**
     (spec #15). ✅
  7. **Gel à la clôture** (R49d) : passer la rencontre en **④ clôture** → le champ
     Repère **disparaît** ; un appel direct à `modifierRepereVoie` est refusé
     (« … une fois la compétition clôturée »). ✅
- **Rétablir** : effacer les repères posés (ou
  `update interclub.voie_difficulte set repere = null where …`) et remettre la
  rencontre ado en ③.
- **Partiellement automatisé** : `e2e/repere-voie.spec.ts` (étapes 1, 2, 3, 6
  côté coach, 7) ; le cahier reste la validation sur base réelle.

### CT-19 — Modifier une voie de difficulté en ② préparation (couvre R51, R52)

- **Rôle** : admin. **Pré-condition** : aucune migration (R51–R55 réutilisent les
  tables et la RLS admin existantes) ; une rencontre **enfant** en **②
  préparation** (le jour de la rencontre), sans résultat saisi sur la voie visée.
- **Étapes / résultat attendu** :
  1. **Structure éditable en ②** (R51 rév. 2026-10-25) : onglet **Voies** → **pas**
     de note de verrouillage ; le formulaire « + Voie » est proposé (ajouter une T3
     avec repère `E2E3` → la ligne « T3 E2E3 » apparaît) ; chaque ligne
     porte les icônes **crayon** (« Modifier la voie … » au survol) et **croix
     rouge** (« Supprimer la voie … ») ; le repère s'enregistre avec la **coche
     verte**. Icônes de 44 px, sur une seule rangée avec le repère. ✅
  2. **Crayon** d'une voie **T6** → le formulaire s'ouvre sous la ligne,
     **pré-rempli** (niveau, type, cotation, points). Passer en **T7**, cotation
     `6c+`, voie entière `12` → **Enregistrer** → le formulaire se ferme, la ligne
     affiche **« T7 »**, `6c+`, `voie 12 pts`. ✅
  3. **Champs conditionnels** (R52, R38) : sur une voie **tête enfant** avec prise
     valorisée, passer le type en **Moulinette** et un niveau **M2** → le champ
     « Prise valo. » disparaît ; après enregistrement la ligne n'affiche plus de
     prise valorisée (`points_prise_valorisee` vide en base). ✅
  4. **Niveau hors plage** (R37) : un appel direct avec `T11` → refus « Niveau tête
     invalide… ». ✅
  5. **Doublon de repère** (R49c) : deux voies avec le repère `Jaune`, l'une en T5,
     l'autre en T6 ; passer la T6 en T5 → refus « Une autre voie T5 porte déjà le
     repère « Jaune » ». ✅
  6. **Lettres recalculées** (R50b) : passer une des deux voies « T5 a » / « T5 b »
     en T6 → la voie restante redevient **« T5 »**. ✅
  7. **Barème en ②** (R47, R51) : onglet **Vitesse**, sans saisie de vitesse sur
     l'épreuve → modifier un échelon → **Enregistrer le barème** → enregistré. ✅
  8. **Barème figé par une saisie** (R55e) : après un retour ③ → ② avec au moins
     un temps (ou chute, non-présentation) saisi → **Enregistrer le barème** →
     refus « Barème non modifiable : N saisie(s) de vitesse … ». ✅

### CT-20 — Voie portant des résultats (couvre R55b, R55a, R55d)

- **Rôle** : admin. **Pré-condition** : une rencontre revenue de **③** à **②**
  (le jour J) avec au moins un résultat sur une voie V (ou, en recette, poser un
  résultat par SQL Editor).
- **Étapes / résultat attendu** :
  1. **Crayon** de V → changer son **niveau** → **Enregistrer** → refus « Niveau et
     type non modifiables : N résultat(s) déjà saisi(s) sur cette voie. » ; idem en
     changeant le **type**. ✅
  2. Remettre le niveau d'origine, changer seulement les **points** → enregistré ;
     le **classement** reflète les nouveaux points (spec #7). ✅
  3. **Croix rouge** de V → **Oui, supprimer** → refus « Suppression impossible : N
     résultat(s) … sur cette voie. » ; la voie et ses résultats sont **intacts**. ✅

### CT-21 — Blocs et paliers (couvre R53, R54, R55a, R55c)

- **Rôle** : admin. **Pré-condition** : rencontre en ① ou ②.
- **Étapes / résultat attendu** :
  1. **Code** : sur un bloc, saisir ` B3  bis ` → **coche verte** → « Code enregistré. »,
     code affiché `B3 bis` ; saisir le code d'un **autre** bloc → refus « Le bloc
     « … » existe déjà. » ; code vide → refus. ✅
  2. **Palier modifié** : changer les points d'un palier → **coche verte** → « Palier
     enregistré. ». ✅
  3. **Palier ajouté** : libellé `Zone 2`, points `25` → **+ Palier** → le palier
     apparaît **en dernier**. Un bloc ajouté **sans palier** en ① peut ainsi en
     recevoir. ✅
  4. **Palier supprimé** : **croix rouge** → **Oui, supprimer** → il disparaît. Sur un
     palier **retenu par un résultat** de bloc → refus « Suppression impossible : N
     résultat(s) retien(nen)t ce palier. ». ✅
  5. **Bloc supprimé** : sans résultat → **Oui, supprimer** → le bloc et ses
     paliers disparaissent ; avec résultat → refus « … sur ce bloc. ». ✅

### CT-22 — Supprimer une voie de vitesse (couvre R54)

- **Rôle** : admin. **Pré-condition** : rencontre en ① ou ② ; un jeton juge
  généré pour la voie visée (`/admin/jetons`).
- **Étapes / résultat attendu** :
  1. Onglet **Vitesse** → **croix rouge** de la voie → la confirmation indique « Ses
     jetons juges seront aussi supprimés. » → **Non** : rien ne change. ✅
  2. **Croix rouge** → **Oui, supprimer** → la voie disparaît ; sur `/admin/jetons`,
     son jeton juge n'existe plus ; un juge qui scanne l'ancien QR est refusé. ✅
  3. Les **temps** déjà saisis sur l'épreuve de vitesse restent en place (spec
     #10). ✅

### CT-23 — Verrouillage à partir de la ③ compétition (couvre R51, R44)

- **Rôle** : admin. **Pré-condition** : rencontre en **③ compétition**.
- **Étapes / résultat attendu** :
  1. La note « la structure est verrouillée… » s'affiche ; **aucun** bouton
     crayon / croix rouge, ni champ de code ou de palier ; le **repère** reste
     modifiable (R49d). ✅
  2. Un appel direct à `modifierVoieDifficulteRencontre`,
     `supprimerBlocRencontre` ou `supprimerVoieVitesseRencontre` est refusé (« La
     structure ne peut plus être modifiée une fois la compétition commencée. »). ✅
  3. Un **coach** qui appelle ces actions est refusé (« Seul un administrateur… »,
     R12). ✅
- **Rétablir** : remettre les éléments modifiés à leur valeur d'origine et la
  rencontre dans sa phase initiale.
- **Partiellement automatisé** : `e2e/edition-structure.spec.ts` (CT-19 étapes 1, 8
  et 2, CT-20, CT-21 étapes 1 à 5 sans résultat, CT-22 étapes 1 et 2 côté
  structure, CT-23 étape 1) ; le cahier reste la validation sur base réelle.

## Registre d'exécution

| Cas | Environnement | Date | Testeur | Verdict | Notes |
|-----|---------------|------|---------|---------|-------|
| CT-01 | | | | ⬜ | |
| CT-02 | | | | ⬜ | |
| CT-03 | | | | ⬜ | |
| CT-04 | | | | ⬜ | |
| CT-05 | | | | ⬜ | |
| CT-06 | | | | ⬜ | |
| CT-07 | | | | ⬜ | |
| CT-08 | | | | ⬜ | |
| CT-09 | | | | ⬜ | |
| CT-10 | | | | ⬜ | |
| CT-11 | | | | ⬜ | |
| CT-12 | | | | ⬜ | |
| CT-13 | | | | ⬜ | phase (R41a) |
| CT-14 | | | | ⬜ | lien QR (R41b) |
| CT-15 | | | | ⬜ | blocs équipes (R41c) |
| CT-16 | | | | ⬜ | barème par rang, édition + validation (R47/R48) |
| CT-17 | | | | ⬜ | phase refusée depuis un écran périmé (R17) |
| CT-18 | | | | ⬜ | repère / libellé des voies doublées (R49/R50) |
| CT-19 | local (Docker) | 2026-10-25 | Claude (E2E) | ⬜ | modifier une voie en ② (R51/R52) — étapes 1–2 vertes en E2E |
| CT-20 | local (Docker) | 2026-10-25 | Claude (E2E) | ⬜ | voie avec résultats (R55) — vert en E2E |
| CT-21 | local (Docker) | 2026-10-25 | Claude (E2E) | ⬜ | blocs et paliers (R53/R54) — vert en E2E sans résultat |
| CT-22 | local (Docker) | 2026-10-25 | Claude (E2E) | ⬜ | suppression voie de vitesse (R54) — vert en E2E |
| CT-23 | local (Docker) | 2026-10-25 | Claude (E2E) | ⬜ | verrouillage en ③ (R51) — étape 1 verte en E2E |

> Le domaine (`validerNiveauVoie` R37, `validerPoints` R38, `champsPointsVoie`
> R38/R43) est couvert par Vitest (`npm run test`, `src/domaine/gabarit.test.ts`).
> Les gardes (admin/phase), la RLS et l'IHM (onglets, lecture seule, état vide)
> se vérifient ici, sur l'app réelle — en priorité **mobile**.
