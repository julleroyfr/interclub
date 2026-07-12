# Cahier de test : <Domaine / Fonctionnalité>

> Modèle réutilisable. Copier ce fichier en `docs/tests/<domaine>.cahier.md` et
> remplir. Voir les règles dans
> [docs/conventions/06-cahier-de-test.md](../conventions/06-cahier-de-test.md).

- **Spec de référence** : `docs/specs/<spec>.md`
- **Pré-requis** : (comptes de test, données initiales, migrations appliquées…)
- **Environnement** : (local / preview Netlify / prod) — version/commit : `______`

## Jeu de données initial

Décrire l'état de la base nécessaire avant de commencer (équipes, joueurs,
comptes par rôle…), pour que le cahier soit rejouable à l'identique.

- …

## Comptes de test

| Compte | Rôle | Usage |
| -------- | ------ | ------- |
| … | capitaine | … |
| … | arbitre | … |
| … | administrateur | … |

## Cas de test

### CT-01 — <titre court>   (couvre : R_, Scénario nominal)

- **Rôle / compte** : …
- **Pré-condition** : …
- **Étapes** :
  1. …
  2. …
- **Résultat attendu** : … (observable, sans ambiguïté)
- **RLS / sécurité** : ce qu'un autre rôle NE doit PAS pouvoir faire/voir

### CT-02 — <titre court>   (couvre : R_)

- **Rôle / compte** : …
- **Pré-condition** : …
- **Étapes** :
  1. …
- **Résultat attendu** : …

## Registre d'exécution

| Date | Testeur | Version/commit | Cas | Résultat | Remarque |
|------|---------|----------------|-----|----------|----------|
| | | | CT-01 | ✅ / ❌ | |
| | | | CT-02 | ✅ / ❌ | |
