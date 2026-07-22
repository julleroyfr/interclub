# ADR 0002 — Lister les comptes Supabase via la clé `service_role` (mapping de rôle)

- **Statut** : acceptée (le 2026-07-22)
- **Décideurs** : julleroyfr (produit) + assistance technique
- **Portée** : administration du mapping de rôle (T5b) ; usage d'un secret serveur
- **Sources** :
  - [`docs/specs/02-authentification-et-sessions-qr.md`](../specs/02-authentification-et-sessions-qr.md)
    (R1–R5 : mapping de rôle ; **« gestion des comptes permanents au-delà du
    mapping » laissée hors périmètre**)
  - [`docs/conventions/00-architecture.md`](../conventions/00-architecture.md)
    (Supabase-first, sécurité en base, « pas d'API custom sauf besoin justifié »)
  - [`docs/conventions/03-base-de-donnees-supabase.md`](../conventions/03-base-de-donnees-supabase.md)
    (RLS, schéma `interclub`)

## Contexte

T5b demande un écran où l'**admin** attribue un rôle (`admin`/`coach`) et, pour un
coach, un club à un **compte Supabase existant** (spec #2 R4). L'admin doit donc
**désigner** ce compte. Or :

- La liste des comptes vit dans `auth.users`, **inaccessible** au rôle
  `authenticated` (ni RLS applicable, ni grant) — seule l'**API admin**
  (`auth.admin.listUsers`) la lit, et elle exige la clé `service_role`.
- Le catalogue `interclub.club` a la **RLS activée sans policy** pour l'instant
  (fail-closed ; ses policies de lecture relèvent de **T6**), donc pas lisible en
  `authenticated` aujourd'hui.

Trois options ont été pesées : saisie de l'**UUID** (insert direct via RLS, zéro
secret mais UX brute), saisie de l'**e-mail** (RPC `SECURITY DEFINER` résolvant
e-mail → `auth.users.id`), ou **liste des comptes** via la clé `service_role`.

## Décision

Charger l'écran de mapping (**liste des comptes** + **liste des clubs** +
**mappings existants**) via un client **`service_role`** côté serveur
(`createAdminClient`, `src/lib/supabase/admin.ts`). L'**écriture** du mapping, elle,
passe **par la RLS** (client `authenticated`, policies « admin crée/modifie un
mapping », spec #2 R4). Le service_role ne sert donc **qu'à la lecture** que la RLS
ne peut pas fournir aujourd'hui.

### Garde-fous

- Le module `admin.ts` importe `server-only` : la clé ne peut **jamais** partir au
  navigateur. Jamais importé depuis un Client Component.
- Tout accès `service_role` est **derrière une garde de rôle applicatif** : la page
  `/admin/mapping` renvoie `notFound()` si le visiteur n'est pas admin, et la
  Server Action `attribuerMapping` re-vérifie `role === 'admin'`.
- La **frontière de sécurité réelle reste la RLS** : même sans la garde applicative,
  l'`upsert` sur `interclub.compte` échouerait pour un non-admin (R4). Le
  service_role ne contourne la RLS **que** pour des lectures d'administration.
- `SUPABASE_SERVICE_ROLE_KEY` est un **secret** : présent en variable
  d'environnement (Netlify par contexte), jamais versionné, jamais préfixé
  `NEXT_PUBLIC_`.

## Conséquences

### Positives

- Bonne UX : l'admin choisit un compte dans une liste (e-mail lisible), sans
  copier-coller d'UUID ni RPC supplémentaire.
- Aucun nouvel objet SQL, donc **aucune migration** pour T5b (le modèle `compte` et
  ses policies existent depuis T5a).
- Surface `service_role` **minimale** (lecture only) et centralisée dans un module
  `server-only` unique et auditable.

### Négatives / points de vigilance

- Introduit l'usage d'un **secret serveur** : à protéger (rotation, périmètre
  Netlify), à ne jamais exposer côté client.
- `listUsers` est **paginée** (perPage 1000 ici) : suffisant pour le volume
  attendu, à revoir si le nombre de comptes explose.
- La lecture des **clubs** via service_role est un **contournement temporaire** de
  la RLS non encore posée : à remplacer par une policy de lecture propre lors de
  **T6**, puis basculer cette lecture sur le client `authenticated`.

## Alternatives considérées

- **UUID saisi (insert RLS)** — écartée : aucune dépendance ni secret, mais UX
  brute (copier-coller d'UUID depuis le dashboard), source d'erreurs.
- **E-mail + RPC `SECURITY DEFINER`** — écartée pour T5b : bonne UX sans
  service_role, mais ajoute un objet SQL (migration + application manuelle) et une
  surface definer à auditer, pour un bénéfice inférieur à la sélection en liste.

## Suite

- **T6** : poser les policies de lecture de `interclub.club` puis rebasculer la
  lecture des clubs de l'écran sur le client `authenticated` (retirer ce
  contournement).
- Documenter `SUPABASE_SERVICE_ROLE_KEY` dans le cahier de test T5b et la config
  d'environnement.
