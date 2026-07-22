# ADR 0001 — Mécanisme d'authentification des sessions QR éphémères

- **Statut** : acceptée (le 2026-07-22)
- **Décideurs** : julleroyfr (produit) + assistance technique
- **Portée** : architecture d'authentification & modèle de données (impacte T5, T6)
- **Sources** :
  - [`docs/specs/01-roles-et-autorisations.md`](../specs/01-roles-et-autorisations.md)
    (R9, R27–R33 : périmètre & fenêtre des sessions éphémères)
  - [`docs/specs/02-authentification-et-sessions-qr.md`](../specs/02-authentification-et-sessions-qr.md)
    (R6–R14, R22–R25 : nature, validité, révocation ; **mécanisme laissé « hors
    périmètre / choix d'architecture »**)
  - [`docs/conventions/03-base-de-donnees-supabase.md`](../conventions/03-base-de-donnees-supabase.md)
    (RLS, schéma `interclub`) et
    [`docs/conventions/00-architecture.md`](../conventions/00-architecture.md)
    (Supabase-first, sécurité en base)

## Contexte

La spec #2 définit **ce que** valent les sessions QR éphémères (coach temporaire,
juge) mais laisse **comment** les authentifier comme un choix d'architecture
(« Supabase Anonymous, JWT/claims custom, magic link… »). Ce choix conditionne à
la fois l'implémentation de l'auth (T5d) et les policies RLS (T6). Il faut donc le
figer avant de coder l'une ou l'autre.

### Exigences déterminantes

Extraites des specs, ce sont elles qui discriminent les options :

- **Anonyme** (spec #2 R7) : un jeton n'est lié à aucune personne nommée.
- **Multi-usage** (R8) : un même jeton ouvre **plusieurs sessions simultanées**
  (plusieurs personnes / appareils).
- **Fenêtre stricte** (R12, spec #1 R9) : une session n'est valide **que** pendant
  la **phase ② compétition** de sa rencontre.
- **Coupure immédiate** (R13, R22, R23) : sortir de la phase ②, **révoquer** ou
  **régénérer** un jeton doit invalider l'accès **au prochain appel**.
- **Périmètre borné** (R24, R25) : coach temporaire → **son club** ; juge → **sa
  voie de vitesse** ; toute action hors périmètre est refusée.
- **Sécurité en base** (convention 00 §2.3) : l'autorisation vit dans la base
  (RLS), le front ne fait jamais autorité.

La contrainte **pivot** est la **coupure immédiate** : la validité doit être
**recalculée en base à chaque requête** (contre `jeton_qr.actif` et
`rencontre.phase`). Elle **ne peut donc pas** être figée dans un jeton d'accès.

## Décision

Authentifier les sessions QR éphémères par **connexion anonyme Supabase**, liée
au jeton scanné via une **table `interclub.session_qr`**, l'ouverture passant par
une **fonction `SECURITY DEFINER`** qui valide le secret et la fenêtre. Les
autorisations restent **entièrement en RLS**, recalculées à chaque requête.

### 1. Ouverture d'une session

```mermaid
sequenceDiagram
  actor U as Coach temp. / Juge
  participant App
  participant Auth as Supabase Auth
  participant DB as interclub (RLS + RPC)
  U->>App: Scan du QR (secret `valeur`)
  App->>Auth: signInAnonymously()
  Auth-->>App: auth.users anonyme (auth.uid())
  App->>DB: rpc ouvrir_session_qr(valeur)
  Note over DB: SECURITY DEFINER — valide jeton.actif ET rencontre.phase = ②
  alt Jeton actif ET phase ②
    DB-->>App: insert session_qr(auth.uid(), jeton) ; renvoie rôle + périmètre
  else Révoqué OU hors phase ②
    DB-->>App: erreur — aucune session (R12, R22)
  end
  U->>App: Action métier
  App->>DB: Requête ordinaire (RLS)
  Note over DB: RLS recalcule périmètre + phase via session_qr → jeton → rencontre
```

- Le scan déclenche `supabase.auth.signInAnonymously()` : chaque appareil obtient
  un utilisateur **anonyme jetable** ⇒ **anonymat** (R7) et **multi-usage** (R8 :
  un scan = une session anonyme indépendante).
- L'app appelle **`interclub.ouvrir_session_qr(p_valeur uuid)`**
  (`SECURITY DEFINER`) : la fonction retrouve le jeton **par son secret**
  (`jeton_qr.valeur`), vérifie `jeton_qr.actif` **et** `rencontre.phase = '②'`,
  puis insère `session_qr(utilisateur_id = auth.uid(), jeton_qr_id)` et renvoie le
  rôle + le périmètre.

### 2. Pourquoi une fonction `SECURITY DEFINER` (entorse assumée)

Sans elle, un utilisateur anonyme pourrait insérer lui-même dans `session_qr` une
ligne pointant vers **n'importe quel** `jeton_qr.id` (p. ex. un jeton d'un autre
club, ou un jeton juge), et **usurper un périmètre**. La fonction impose la
connaissance du **secret scanné** (`valeur`, non devinable) et valide la fenêtre
temporelle **au moment de l'ouverture**. C'est la **seule** surface
`SECURITY DEFINER`, minimale et justifiée — conforme à la clause « sauf besoin
justifié » de la convention 00 §5. Les clients n'ont **aucun** droit `insert`
direct sur `session_qr`.

### 3. Autorisations en RLS (recalcul par requête)

Les policies des tables métier autorisent **deux chemins d'acteur** :

- **Permanent** : `auth.uid() → interclub.compte` donne `role` + `club_id`
  (admin / coach permanent).
- **Éphémère** : `auth.uid() → session_qr → jeton_qr → rencontre` donne la
  **nature** (coach temporaire / juge), le **périmètre** (club ou voie) et la
  **rencontre**, **à condition** que `jeton_qr.actif` soit vrai **et**
  `rencontre.phase = '②'`.

Comme la policy relit `jeton_qr.actif` et `rencontre.phase` **à chaque requête**,
la **révocation** (R22), la **régénération** (R23) et la **sortie de phase ②**
(R13) coupent l'accès **immédiatement**, sans expiration ni rafraîchissement de
jeton. C'est l'objectif que les alternatives ne tiennent pas proprement.

### 4. Impact sur le modèle de données

Ajout d'**une** table (à formaliser en migration lors de T5d) :

| Table | Rôle | Colonnes clés |
| ------- | ------ | --------------- |
| `interclub.session_qr` | Lie un utilisateur **anonyme** au **jeton** qu'il a scanné | `id` (uuid PK) ; `utilisateur_id` (uuid → `auth.users`, `on delete cascade`) ; `jeton_qr_id` (uuid → `interclub.jeton_qr`, `on delete cascade`) ; `created_at` |

- **RLS `session_qr`** : `select` limité à sa propre ligne
  (`utilisateur_id = auth.uid()`) ; **aucun** `insert/update/delete` client
  (ouverture par la RPC, fin de session par cascade/révocation logique).
- Les tables `compte` et `jeton_qr` existent déjà (migration
  `202607221200_auth_et_jetons_qr`). `session_qr` complète le modèle côté
  **sessions ouvertes** (le jeton = droit d'ouvrir ; la session = ouverture
  effective par un anonyme).
- La **validité ne se stocke pas** (spec #2 « Contraintes de données ») : elle se
  calcule (jeton actif + phase ②).

## Conséquences

### Positives

- Coupure immédiate (R13, R22, R23) native, sans expiration de jeton.
- Autorisation **uniforme en RLS** pour permanents et éphémères ; le front ne
  décide rien.
- Anonymat (R7) et multi-usage (R8) directement couverts par les connexions
  anonymes.
- Une seule surface `SECURITY DEFINER`, périmètre réduit et auditable.

### Négatives / points de vigilance

- Les **connexions anonymes** doivent être **activées** dans Supabase (Dashboard →
  Authentication → Providers → Anonymous). À documenter dans le cahier de test et
  l'`.env`/config.
- Les utilisateurs anonymes **s'accumulent** dans `auth.users` : prévoir une
  **purge** (job / script) des anonymes sans `session_qr` active ou au-delà d'une
  ancienneté. À traiter lors de T5d (hors périmètre de cet ADR).
- Une jointure `session_qr → jeton_qr → rencontre` par requête : prévoir les
  **index** (`session_qr.utilisateur_id`, `jeton_qr.rencontre_id` déjà présent) ;
  envisager une fonction SQL `stable` d'aide (`interclub.perimetre_courant()`)
  pour factoriser les policies.
- La **phase** de la rencontre doit être fiable et indexable (déjà portée par
  `rencontre`, cf. modèle socle) ; les transitions de phase restent hors périmètre
  (spec #1/#2).

## Alternatives considérées

### A. Claims JWT via Auth Hook (custom access token hook) — **écartée**

Embarquer rôle + périmètre + rencontre dans le JWT à l'ouverture. Lecture RLS
simple (`auth.jwt() ->> …`), **mais** les claims sont **figés** jusqu'au
rafraîchissement : la **révocation** et la **sortie de phase ②** ne coupent pas
**immédiatement** (R13, R22) sauf expiration très courte + refresh permanent —
complexité et fenêtre de faille. Contraire à l'exigence pivot.

### B. Tout par fonctions `SECURITY DEFINER` (pas de RLS sur écritures éphémères) — **écartée**

Faire transiter chaque action éphémère par une fonction definer validant le
secret. Fonctionne, mais **abandonne l'uniformité RLS** (deux régimes
d'autorisation), multiplie la surface `SECURITY DEFINER` et la logique custom en
base, plus difficile à auditer que des policies déclaratives.

### C. Magic link / OTP par e-mail — **écartée d'emblée**

Incompatible avec l'**anonymat** (R7) et l'usage **sans identité nommée** ni
adresse (bénévoles scannant un QR sur place).

## Traçabilité

| Règle (spec) | Couverte par |
| -------------- | -------------- |
| R7 anonyme, R8 multi-usage (spec #2) | Connexions anonymes Supabase |
| R6 rôle+périmètre+rencontre (spec #2) | `session_qr → jeton_qr` (nature, club/voie, rencontre) |
| R12 phase ②, R9 (spec #1) | Vérif `rencontre.phase = ②` dans la RPC **et** dans les policies |
| R13, R22, R23 coupure immédiate | RLS recalculée par requête sur `jeton_qr.actif` + `phase` |
| R24, R25 périmètre (spec #2) ; R20, R30 (spec #1) | Jointure de périmètre (club / voie) dans les policies |
| Sécurité en base (convention 00) | Autorisation 100 % RLS ; unique RPC definer justifiée |

## Suite

- **T5d** : migration `session_qr` (+ RLS + RPC `ouvrir_session_qr`), puis code
  d'ouverture de session (scan → `signInAnonymously` → RPC).
- **T6** : policies RLS des tables métier intégrant les deux chemins (permanent
  via `compte`, éphémère via `session_qr`) et le gating de phase.
- Mettre à jour la spec #2 (renvoi vers cet ADR) et le `docs/TODO-initialisation.md`.
