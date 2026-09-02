# Cahier de test : Écran admin — prêts de grimpeurs (spec #1 R35)

> Couvre l'écran `/admin/prets` : création et révocation d'un **prêt** (mise à
> disposition d'un grimpeur d'un autre club à un club d'accueil pour une
> rencontre), et l'effet côté coach (le prêté apparaît dans son roster).
> Marquage `[auto]`/`[manuel]` : cf. [convention 06 §3.1](../conventions/06-cahier-de-test.md).
> Automatisé : `e2e/admin-prets.spec.ts` (`npm run test:e2e -- admin-prets`).

- **Spec de référence** : `docs/specs/01-roles-et-autorisations.md` (R35/R36) ;
  `docs/specs/05-espace-coach.md` (R12/R13).
- **Pré-requis** : migrations jusqu'à **`202609021000_pret_grimpeur`** incluse
  (table `pret` + grants `service_role`) ; seed 01 ; app dev port 3011.
- **Environnement** : local (stack Docker) — version/commit : `______`

## Jeu de données initial

Seed `01` : rencontre pilote `3333…` (Club A, enfant) ; **Devi Bravo** (Club B)
**libre** ; comptes `admin@test.local`, `coach@test.local` (Club A).

## Cas de test

### CT-01 `[auto]` — Accès réservé à l'admin   (couvre : R35 ; RLS/garde)

- **Étapes** : ouvrir `/admin/prets` en `coach@test.local`, puis non connecté.
- **Résultat attendu** : **404** dans les deux cas ; en `admin@test.local`, l'écran
  s'affiche (formulaire « Créer un prêt » + tableau « Prêts en cours »).

### CT-02 `[auto]` — Créer un prêt et le voir côté coach   (couvre : R35, R12, R13 ; nominal)

- **Rôle / compte** : `admin@test.local`, puis `coach@test.local`.
- **Étapes** :
  1. **Admin** : `/admin/prets` → Rencontre = 19/09/2026 Club A, Grimpeur =
     **Devi Bravo — Club B**, Club d'accueil = **Club A** → « Créer le prêt ».
  2. **Coach** (Club A) : ouvrir la rencontre en phase `pre_competition`.
- **Résultat attendu** :
  - Étape 1 : message « Prêt créé. » ; une ligne apparaît dans « Prêts en cours »
    (Devi Bravo · origine Club B · accueil Club A).
  - Étape 2 : Devi Bravo apparaît dans le **roster** du coach, libellé
    **« Devi Bravo (prêté · Club B) »** (R12/R13).

### CT-03 `[auto]` — Refus : prêt vers le club d'origine   (couvre : R35 ; cas limite)

- **Étapes** : admin, créer un prêt Devi Bravo (Club B) → **Club d'accueil = Club B**.
- **Résultat attendu** : refus avec message « Un grimpeur ne peut pas être prêté à
  son propre club. » ; aucune ligne créée.

### CT-04 `[auto]` — Refus : doublon de prêt   (couvre : R35 ; cas limite)

- **Pré-condition** : Devi déjà prêté à Club A (CT-02).
- **Étapes** : recréer le même prêt (Devi → Club A, même rencontre).
- **Résultat attendu** : refus « Ce grimpeur est déjà prêté pour cette rencontre. »
  (unicité `pret(rencontre, grimpeur)`).

### CT-05 `[auto]` — Révoquer un prêt   (couvre : R35 ; nominal)

- **Pré-condition** : un prêt en cours (CT-02).
- **Étapes** : admin, cliquer **Révoquer** sur la ligne du prêt.
- **Résultat attendu** : la ligne disparaît ; côté coach, Devi ne figure plus au
  roster (sauf s'il est encore composé dans une équipe — le prêt et l'appartenance
  sont indépendants).

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Marque | Résultat | Remarque |
|------|---------|----------------|-----|--------|----------|----------|
| | | | CT-01 | auto | ✅ / ❌ | garde admin |
| | | | CT-02 | auto | ✅ / ❌ | prêt → roster coach |
| | | | CT-03 | auto | ✅ / ❌ | refus même club |
| | | | CT-04 | auto | ✅ / ❌ | doublon |
| | | | CT-05 | auto | ✅ / ❌ | révocation |
