# 08 — IHM & Responsive

L'application doit être **responsive** : certains écrans sont consultés sur
**téléphone** (ex. saisie/consultation d'une feuille de match au bord du terrain),
d'autres sur tablette et ordinateur. On conçoit **mobile-first**.

Stack UI réelle : **Tailwind CSS v4** (config CSS-first via `@theme` dans
`src/app/globals.css`), **React 19 / Next 16**, fonts **Geist**, dark mode via
`prefers-color-scheme`. Skill opérationnel : `expertise-ihm-responsive`.

## 1. Principes

1. **Mobile-first.** On écrit d'abord le style pour petit écran (sans préfixe),
   puis on **enrichit** vers le haut avec `sm: md: lg: xl: 2xl:`. Jamais l'inverse.
2. **Contenu d'abord, pas de largeur figée.** Layouts fluides (`flex`, `grid`,
   `%`, `min()/max()/clamp()`), pas de `width` en pixels durs qui casse en petit.
3. **Aucun défilement horizontal** non voulu. Tester à **360 px** de large
   (petit téléphone) : rien ne déborde.
4. **Cibles tactiles ≥ 44×44 px** avec espacement suffisant (boutons, liens,
   lignes cliquables). Le doigt n'est pas un curseur.
5. **Accessibilité de base non négociable** (cf. §6).
6. **UI en français** (cf. [02-conventions-code.md](./02-conventions-code.md)).

## 2. Breakpoints (Tailwind v4, défauts)

| Préfixe | ≥ largeur | Cible typique |
| --------- | ----------- | ---------------- |
| _(aucun)_ | 0 | Téléphone (base) |
| `sm:` | 640 px | Grand téléphone / petite tablette |
| `md:` | 768 px | Tablette |
| `lg:` | 1024 px | Ordinateur |
| `xl:` / `2xl:` | 1280 / 1536 px | Grand écran |

- Raisonner par **intention** (« à partir de la tablette »), pas par appareil précis.
- Personnaliser les breakpoints se fait **en CSS** via `@theme` (Tailwind v4), pas
  dans un `tailwind.config.js` (il n'y en a pas). Rester sur les défauts sauf
  besoin justifié.

## 3. Viewport & meta (Next 16)

- Le viewport se déclare via l'**export `viewport`** dans un `layout`/`page`
  (API Next 16), pas via une balise `<meta>` manuelle :

  ```ts
  import type { Viewport } from 'next'
  export const viewport: Viewport = { width: 'device-width', initialScale: 1 }
  ```

- `lang` du `<html>` doit refléter la langue de l'UI (**`fr`**).

## 4. Patterns responsive utiles au domaine

- **Tableaux (classements, feuilles de match)** : un tableau large ne tient pas
  sur téléphone. Deux stratégies :
  - **Cartes empilées** en dessous de `md:` (chaque ligne devient une carte),
    tableau classique à partir de `md:`. **Préféré** pour la lecture mobile.
  - À défaut, conteneur `overflow-x-auto` (moins bon, défilement horizontal).
- **Navigation** : barre/menu compact (drawer/bottom-bar) sur mobile, nav étendue
  sur `lg:`.
- **Formulaires de saisie** (compositions, scores) : une colonne sur mobile,
  multi-colonnes `md:grid-cols-2` au-delà. Boutons d'action pleine largeur sur
  mobile.
- **Images** : composant `next/image` (tailles/`sizes` responsives). Vérifier les
  défauts v16 (cf. [07-standards-nextjs-16.md](./07-standards-nextjs-16.md) §7).

## 5. Formulaires sur mobile

- **`font-size` ≥ 16 px** sur les champs (évite le zoom auto iOS).
- **Bons types d'`input`** pour afficher le bon clavier : `type="number"`,
  `inputmode`, `email`, `tel`, `date`…
- `<label>` associé à chaque champ (cliquable, accessible).
- Cibles de saisie et boutons assez grands et espacés.

## 6. Accessibilité (a11y)

- **HTML sémantique** : `button` pour agir, `a` pour naviguer, titres `h1…hn`
  ordonnés, listes, `table`/`th` pour de vraies données tabulaires.
- **États focus visibles** (ne pas supprimer l'outline sans alternative).
- **Contraste** suffisant (viser WCAG AA), y compris en dark mode.
- **Navigation clavier** possible sur tout élément interactif.
- Textes alternatifs sur les images porteuses de sens.
- Respecter `prefers-reduced-motion` pour les animations.

## 7. Style & thème (Tailwind v4)

- Config **CSS-first** : tokens (couleurs, fonts) dans `@theme` de `globals.css`.
  Réutiliser les variables (`--color-*`, `--font-*`) plutôt que des valeurs en dur.
- **Dark mode** déjà géré via `prefers-color-scheme` : penser les deux thèmes.
- Utilitaires Tailwind dans le JSX ; factoriser un motif répété en **composant**
  React, pas en accumulant des classes copiées-collées.
- Espacements/typographie cohérents (échelle Tailwind), pas de valeurs magiques.

## 8. Vérification (rappel : tests IHM manuels)

Le responsive se **vérifie à la main** (pas de Docker/CI d'IHM ici) :

- Dérouler les parcours mobiles dans le **cahier de test**
  ([06-cahier-de-test.md](./06-cahier-de-test.md)) en précisant l'**appareil/largeur**
  (au moins : téléphone ~360–390 px, tablette, desktop).
- Points à cocher par écran mobile : pas de scroll horizontal, cibles tactiles OK,
  formulaires utilisables, lisibilité, focus visibles.
- Tester en dark mode quand pertinent.

## 9. À ADAPTER pour un autre projet

- La charte (couleurs, fonts) dans `@theme`.
- Les écrans devant impérativement fonctionner sur téléphone (à lister par projet).
