# Catalogue des jeux de données de test

> **But** : recenser les **jeux de données réutilisables** fournis par le seed
> (`supabase/seed/01-jeu-de-test.sql`) afin qu'un cahier de test **référence** un
> jeu existant plutôt que d'en redéfinir un. Un même jeu peut servir plusieurs
> **CT**, dans le **même cahier** ou dans **plusieurs cahiers**.

## Comment s'en servir

- Chaque jeu porte un identifiant `JD-xxx`, une description, les **données seed**
  qui le matérialisent (UUID / valeurs clés) et la colonne **Utilisé par**.
- **Notation « Utilisé par »** : `‹cahier›:CT-xx` (ex. `17:CT-04`). Quand le CT
  précis n'est pas encore tracé pour un cahier ancien, on cite le **cahier seul**
  (ex. `13`) — à affiner au fil des relectures.
- Les cahiers sont numérotés comme leur fichier `docs/tests/‹n›-….cahier.md`.

## Règle de maintenance (obligatoire)

> À **chaque création ou mise à jour d'un cahier** (`rediger-cahier-de-test`) :
>
> 1. Pour chaque CT, identifier le(s) jeu(x) de données consommé(s) ; **réutiliser**
>    un `JD-xxx` existant si pertinent plutôt que d'en inventer un.
> 2. Reporter le CT dans la colonne **Utilisé par** du/des jeux concernés.
> 3. Si le cahier introduit une donnée **durable et réutilisable**, l'ajouter au
>    seed **et** créer ici son `JD-xxx` (données + première utilisation).
> 4. Une donnée seulement **locale à un CT** (créée puis jetée dans le cas) n'a pas
>    vocation à figurer ici — seul le **réutilisable** est catalogué.

## Comptes & rôles

Mot de passe des cinq comptes permanents : `interclub`.

| ID | Description | Données (seed) | Utilisé par |
|----|-------------|----------------|-------------|
| JD-ADMIN | Administrateur, sans club | `admin@test.local` · `aaaaaaaa-…-aaaaaaaaaaaa` · rôle `admin` | 17:CT-01/CT-12 · 18:CT-01/CT-07/CT-08/CT-11 · 19:CT-01→CT-10 · 22:CT-01/CT-03/CT-08/CT-10/CT-11 · 02 · 03 · 04 · 06 · 07 · 08 · 09 · 10 · 11 · 12 · 13 · 14 · 15 · 16 |
| JD-COACH-A | Coach **permanent** Club A (acteur principal de saisie/engagement/consultation) | `coach@test.local` · `cccccccc-…-cccccccccccc` · rôle `coach`, club A | 17:CT-01→CT-14 · 18:CT-01→CT-11 · 19:CT-01/CT-05 · 22:CT-02→CT-12 · 03 · 04 · 06 · 09 · 12 · 13 · 16 |
| JD-COACH-A2 | 2ᵉ coach **permanent** Club A (2ᵉ observateur Club A pour les tests cross-fenêtre) | `coach2@test.local` · `cccccccc-…-cccccccccc02` · rôle `coach`, club A | 22:CT-03/CT-06/CT-07/CT-08/CT-09/CT-11 |
| JD-COACH-B | Coach **permanent** Club B (observateur Club B ; vérifie bornage cross-club) | `coachb@test.local` · `dddddddd-…-dddddddddddd` · rôle `coach`, club B | 22:CT-03/CT-10/CT-11 |
| JD-SANSMAP | Compte **authentifié sans rôle** (négatif d'accès ; lecture RLS publique) | `sansmapping@test.local` · `55555555-…-555555555555` · **aucune** ligne `compte` | 17:CT-01/CT-13 · 22:CT-10 · 02 · 03 · 04 · 06 · 13 · 16 |

## Clubs

| ID | Description | Données (seed) | Utilisé par |
|----|-------------|----------------|-------------|
| JD-CLUB-A | Club porteur de la rencontre de test | `Club A` · `11111111-…` | 06 · 09 · 13 · 14 · 15 · 17 · 18 · 22 |
| JD-CLUB-B | Club tiers (grimpeur prêté, lecture cross-club) | `Club B` · `22222222-…` | 06 · 09 · 13 · 14 · 15 · 17 · 18 · 22 |

## Rencontre & structure d'épreuve — ENFANT

| ID | Description | Données (seed) | Utilisé par |
|----|-------------|----------------|-------------|
| JD-RENCONTRE-ENFANT | Rencontre **enfant**, Club A, du **19/09/2026**, en phase `competition` (bascule possible en SQL) | `33333333-…-3333` · épreuves voie `…8801`, bloc `…8802`, vitesse `…8803` | 06 · 13 · 14 · 15 · 17 (toute) · 18 (toute) · 19 (toute) · 21 (toute) · 22 (toute) |
| JD-STRUCTURE-ENFANT | Structure **complète** du gabarit enfant : 4 voies moulinette **M1–M4**, 10 voies tête **T1–T10** (cotations + points + prise valorisée) | voies `…9911`…`…9914` (M1–M4), `…9901` (T1)…`…9929` (T10) sur épreuve `…8801` | 17:CT-04/CT-05/CT-06/CT-07/CT-13 · 18:CT-02/CT-04/CT-05 · 22:CT-02/CT-04 |
| JD-BLOCS-ENFANT | Deux blocs et **tous** leurs paliers par essai : **B1** (1er=4, 2e=3), **B2** (1er=6, 2e=5, 3e=4) | B1 `…9902` (paliers `…99a1`,`…99a2`) · B2 `…9903` (paliers `…99b1`,`…99b2`,`…99b3`) | 17:CT-09/CT-12 · 18:CT-02/CT-05 · 22:CT-03/CT-04 |
| JD-VITESSE | Deux voies de vitesse (affectation juge) | `44444444-…-4444` (n°1) · `44444444-…-4445` (n°2) | 05 · 06 · 13 · 17:CT-14 · 20 (toute) · 21 · 22 |
| JD-BAREME-VITESSE-ENFANT | **Barème de vitesse enfant** (§ Matin, spec #3 R46) seedé sur l'épreuve vitesse `…8803` : échelons 1–5=15/décr 1, 6–10=10 … 46+=2 ; **chute=1**, **NP=0** | échelons `bareme_vitesse_echelon` (epreuve `…8803`) + `epreuve.points_chute/points_non_presentation` | 21 (toute) · 22:CT-04/CT-05 |

## Rencontre & structure d'épreuve — ADO

> Famille d'UUID `adadadad-…`. Format ado : voies **tête T1–T10 avec zones**
> (z1/z2, R12), **pas** de moulinette ni de prise valorisée ; saisie en **choix
> libre** de 6 voies (R11/R14, aucun groupe de départ) ; paliers de blocs ado.

| ID | Description | Données (seed) | Utilisé par |
|----|-------------|----------------|-------------|
| JD-RENCONTRE-ADO | Rencontre **ado**, Club A, du **19/09/2026**, phase `competition` | `adadadad-adad-…-adad` · épreuves voie `adadadad-…-a1`, bloc `…-a2`, vitesse `…-a3` | 17:CT-07 · 21:CT-08 |
| JD-BAREME-VITESSE-ADO | **Barème de vitesse ado** (§ Après-midi, spec #3 R46) seedé sur l'épreuve vitesse `…-a3` : 1–5=60/décr 1, 6–50=55/décr 1, 51+=10 ; **chute=5**, **NP=0** | échelons `bareme_vitesse_echelon` (epreuve `…-a3`) + `epreuve.points_chute/points_non_presentation` | 21:CT-08 |
| JD-STRUCTURE-ADO | Voies **tête T1–T10** avec `points_zone1`/`points_zone2` (barème « Après-midi ») **+ un 2ᵉ T5** (niveau dupliqué, R11) pour le choix libre de deux voies de même niveau | voies `adadadad-…-0001`…`…-0010` + `…-0015` (T5 bis) sur épreuve `…-a1` | 17:CT-07 |
| JD-BLOCS-ADO | Blocs ado + paliers : **B1** (Zone=10, Bloc complet=30), **B2** (Zone 1=20, Zone 2=40, Bloc complet=60) | B1 `adadadad-…-b1`, B2 `…-b2` | 17:CT-09 (variante ado) |
| JD-EQUIPE-ADO | Équipe **« Ados A1 »** (Club A) avec 2 grimpeurs ado (**Nora**, **Owen**, nés 2011) — support du choix libre 6 voies | équipe `adadadad-…-e001` · grimpeurs `adadadad-…-c1`/`…-c2` | 17:CT-07/CT-08 |

## Équipes & compositions

| ID | Description | Données (seed) | Utilisé par |
|----|-------------|----------------|-------------|
| JD-EQUIPE-A1 | Équipe A1 (Club A) composée (Ana + Bob), support des deux vues et de la navigation ; équipe **mixte** (F+G) pour le classement | `66666666-…-6666` | 17:CT-02/CT-03 · 18:CT-06/CT-07 · 22:CT-02→CT-05 · 06 · 13 · 15 |
| JD-EQUIPE-A2 | Équipe A2 (Club A) avec **Devi** (grimpeur prêté Club B) — support du scénario de prêt cross-club | `66666666-…-6602` | 06 · 13 · 15 · 22:CT-13 |
| JD-EQUIPE-B1 | Équipe B1 (Club B) composée (Cléo), négatif de périmètre / lecture cross-club | `77777777-…-7777` | 06 · 13 · 14 · 15 · 18:CT-06/CT-09 · 22:CT-04/CT-05 |

## Grimpeurs

| ID | Description | Données (seed) | Utilisé par |
|----|-------------|----------------|-------------|
| JD-ANA-M2 | Enfant **Filles**, **groupe M2** → enchaîne **M2·M3·M4** (moulinette) | `a0000000-…-a1` (2015, **F**) · compo A1, `groupe_depart='M2'` | 17:CT-04/CT-05/CT-06/CT-12/CT-13 · 18:CT-02/CT-03/CT-05 · 22:CT-03/CT-05 · 13 · 15 |
| JD-BOB-T1 | Enfant **Garçons**, **groupe T1** → enchaîne **T1·T2·T3** | `a0000000-…-a2` (2016, **G**) · compo A1, `groupe_depart='T1'` | 17:CT-02/CT-03 · 18:CT-04/CT-06 · 22:CT-02/CT-04 · 13 · 15 |
| JD-CLEO-T2 | Enfant **Filles** Club B, **groupe T2**, équipe B1 | `b0000000-…-b1` (2015, **F**) · compo B1, `groupe_depart='T2'` | 18:CT-05/CT-06/CT-09 · 19:CT-02/CT-03 · 22:CT-05 · 13 · 14 · 15 |
| JD-PRETE-DEVI | Grimpeur **Garçons** Club B, **prêté** à Club A — composé dans `JD-EQUIPE-A2` au seed (R35/R36 ; R7 classement) | `b0000000-…-b2` (2016, **G**) · composé dans `JD-EQUIPE-A2` | 18:CT-07 · 22:CT-13 · 14 · 13 · 15 · 17 (jeu de données) |
| JD-POOL-LIBRES | **8 grimpeurs libres** Club A (Chloé…Jade) : remplir une équipe à 8/8, ou engager **sans groupe** (cas R9) | `a0000000-…-a3` … `a0000000-…-aa` (sexe **F/G** au seed) | 13:remplissage 8/8 · 17:cas R9 (groupe « à définir ») · 18:CT-10 |

## Jetons QR (sessions éphémères)

| ID | Description | Données (seed) | Utilisé par |
|----|-------------|----------------|-------------|
| JD-JETON-COACHTEMP | Jeton **coach temporaire** Club A (scan → session éphémère, droits jour J), lié à la rencontre enfant `33333333` | id `55555555-…-5551` · valeur `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa` | 17:CT-10 · 18:CT-12 · 19:CT-01 · 05 · 06 · 13 |
| JD-JETON-JUGE | Jeton **juge** de la voie de vitesse n°1 (saisie des temps) | id `55555555-…-5552` · valeur `bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb` | 17:CT-14 · 05 · 06 · 13 · 20 (toute) · 21 · 22:CT-04/CT-05/CT-08 |

## Notes

- Les **résultats** (voie/bloc) et **temps de vitesse** ne sont **pas** seedés :
  ils sont saisis pendant le déroulé (état « avant saisie »). Un cahier qui a
  besoin d'un résultat pré-existant le crée dans le CT (donnée locale, non
  cataloguée) — cf. l'approche du script `scripts/test-resultats.sh`.
- La catégorie **ado** est désormais **seedée** (`JD-RENCONTRE-ADO` & co.).
  Créer une rencontre ado via le **gabarit admin** reste possible pour tester la
  RPC de copie de gabarit elle-même.
- Depuis la migration `202609181000_grimpeur_sexe`, **tout grimpeur du seed porte
  un `sexe`** (`F`/`G`, obligatoire) — prérequis du classement individuel séparé
  par sexe (spec #7 R8b). Équipe A1 est **mixte** (Ana F + Bob G).
- Ce catalogue reste **cohérent avec le seed** : toute évolution du seed doit s'y
  refléter (et réciproquement).
