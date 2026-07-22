# Design system « Nuit »

Bibliothèque de composants d'interface homogènes et réutilisables, issue du
template **Nuit** retenu. Thème **sombre**, verre dépoli, accents cyan / lime.

- **Import** : `import { Bouton, Carte } from '@/composants'`
- **Tokens** : définis en CSS via `@theme` dans `src/app/globals.css`. Toujours
  passer par les utilitaires générés (`bg-*`, `text-*`, `border-*`) plutôt que
  par des couleurs brutes.
- **Conventions** : mobile-first, cibles tactiles ≥ 44 px, `text-base` (16 px)
  sur les champs, focus visibles, HTML sémantique, UI en français.
  Voir `docs/conventions/08-ihm-responsive.md`.
- **Aperçu vivant** : `/design-system` (galerie) et les écrans d'exemple
  `/templates/nuit/*`.

## Tokens sémantiques

| Token | Rôle |
| --- | --- |
| `fond` | Fond de l'application |
| `surface` / `surface-forte` | Carte en verre / état survol-actif |
| `bordure` | Contours discrets |
| `accent` / `accent-doux` | Cyan — action primaire, focus |
| `secondaire` | Lime — succès, mise en avant |
| `danger` | Rose — chute, erreur, destructif |
| `texte-fort` / `texte` / `texte-attenue` / `texte-doux` | Hiérarchie de texte |

## Composants

| Composant | Rôle |
| --- | --- |
| `Coquille` | Shell : fond, en-tête collant, navigation |
| `NavPrincipale` | Navigation avec onglet actif (Client Component) |
| `EnTetePage`, `TitreSection` | Titres de page et de section |
| `Carte` | Conteneur en verre (option `interactive`) |
| `Bouton` | `primaire` \| `secondaire` \| `fantome` \| `danger`, tailles `md` (44px) / `sm` |
| `ChampTexte` | Saisie labellisée, indice / erreur, anti-zoom iOS |
| `ChampSelect` | Liste déroulante labellisée (`options` + `placeholder`), menu natif en thème sombre (`color-scheme`), indice / erreur |
| `GroupeRadio` | Groupe de boutons radio (un choix ; `options`), contrôlé ou non, cibles tactiles ≥44px |
| `ChampCase` | Case à cocher labellisée (indice optionnel), ligne cliquable ≥44px |
| `Etiquette` | Badge de statut : `accent` \| `succes` \| `neutre` \| `danger` |
| `Pastille` | Point d'état lumineux |
| `Tableau` & primitives | Tableau responsive (`overflow-x-auto`) |

## Server / Client

Tous les composants sont présentationnels et **sans état** : utilisables en
Server Component. Seul `NavPrincipale` est `"use client"` (il lit `usePathname`).
Passez les gestionnaires d'événements depuis un Client Component parent.
