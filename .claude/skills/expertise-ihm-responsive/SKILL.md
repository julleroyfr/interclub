---
name: expertise-ihm-responsive
description: Concevoir et coder des interfaces responsive (mobile-first) avec Tailwind CSS v4 sur Next 16 / React 19. À utiliser dès qu'on crée ou modifie un écran, un composant UI, un formulaire ou une mise en page. Impose le mobile-first, les cibles tactiles, l'accessibilité, et la vérification manuelle sur téléphone via le cahier de test.
---

# Expertise IHM & Responsive

L'app est consultée sur **téléphone**, tablette et desktop. On conçoit
**mobile-first**. Conventions détaillées : `docs/conventions/08-ihm-responsive.md`.
Stack : **Tailwind v4** (CSS-first, `@theme` dans `src/app/globals.css`),
React 19 / Next 16, dark mode via `prefers-color-scheme`.

## Réflexes avant de coder un écran

1. **Partir du téléphone** (~360–390 px) : mise en page en une colonne, contenu
   essentiel d'abord. Enrichir ensuite avec `sm: md: lg:`.
2. Identifier les **éléments tactiles** → ≥ 44×44 px, espacés.
3. Prévoir le comportement des **tableaux** (classements, feuilles de match) sur
   mobile (cartes empilées `< md:`, tableau `≥ md:`).
4. Décider **Server vs Client Component** : interactivité (état, événements) →
   `"use client"` au plus bas ; sinon Server Component. Voir `expertise-nextjs`.

## Règles

- **Mobile-first** : styles de base sans préfixe, puis `sm: md: lg: xl:`. Jamais
  l'inverse (pas de `max-*` par défaut).
- **Pas de largeur figée** : `flex`/`grid`/`clamp()`, jamais de `w-[900px]` qui
  déborde sur mobile. **Zéro scroll horizontal** non voulu à 360 px.
- **Formulaires mobiles** : `font-size ≥ 16px` sur les champs (anti-zoom iOS),
  bons `type`/`inputmode` (clavier adapté), `<label>` associé, boutons pleine
  largeur sur mobile.
- **Accessibilité** : HTML sémantique (`button` agit, `a` navigue, titres
  ordonnés, `table/th` pour vraies données), focus visibles, contraste WCAG AA,
  navigation clavier, `prefers-reduced-motion`.
- **Thème** : réutiliser les tokens `@theme` (`--color-*`, `--font-*`), penser
  **dark mode**. Factoriser un motif de classes répété en **composant** React.
- **Images** : `next/image` avec `sizes` responsives (défauts v16 : cf.
  `docs/conventions/07-standards-nextjs-16.md`).
- **Viewport** : via l'export `viewport` de Next 16, pas de `<meta>` manuelle ;
  `<html lang="fr">`.
- **UI en français**.

## Breakpoints Tailwind (défauts)

`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 px. Raisonner par
intention (« à partir de la tablette »), pas par appareil. Personnalisation
éventuelle en CSS via `@theme` (pas de `tailwind.config.js` en v4).

## Vérification (manuelle — pas de CI d'IHM ici)

- Ajouter/mettre à jour des cas mobiles dans le **cahier de test**
  (`docs/conventions/06-cahier-de-test.md`), en précisant l'**appareil/largeur**
  (téléphone ~360–390 px, tablette, desktop).
- Checklist par écran mobile : pas de scroll horizontal, cibles tactiles OK,
  formulaires utilisables, lisibilité, focus visibles, dark mode si pertinent.

## Lien avec le workflow

L'IHM suit aussi le spec-first : un écran découle d'une spec (scénarios,
règles d'affichage). Coder après la spec et les tests ; vérifier via le cahier.
Voir `nouvelle-fonctionnalite`.
