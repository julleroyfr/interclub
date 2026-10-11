# Revue globale code & architecture — 2026-10-03

- **Périmètre** : tout le projet, branche `develop` (commit `eeceb44`).
- **Réalisée par** : agent `revue-code-architecture`
  (`.claude/agents/revue-code-architecture.md`), en lecture seule.
- **Statut** : constats à traiter — plan : [2026-10-03-plan-action.md](./2026-10-03-plan-action.md). Les corrections qui touchent une spec
  (#6 R14 pour M7, #10/#7 pour M3) passent par validation explicite puis spec → tests → code.

## Synthèse

Le code applicatif est sain :

- toutes les Server Actions vérifient l'auth et le rôle ;
- `src/domaine/` est pur (aucun import de Next, Supabase ou React, ni horloge ou
  aléatoire non injectés) ;
- `service_role` reste dans un module `server-only` et n'atteint jamais le client ;
- toutes les tables ont la RLS (sauf `version`, sans grant) ;
- typecheck, lint, tests et lint:md passent.

Les faiblesses sont **en base**, là où la RLS ne couvre pas l'écriture :

1. une RPC `SECURITY DEFINER` sans garde admin, exécutable par `PUBLIC` ;
2. des colonnes d'audit et de contrôle écrivables par le client ;
3. des temps de vitesse non bornés aux grimpeurs engagés.

S'y ajoutent la règle d'adjacence des phases (spec #3 R17), non imposée côté
serveur, et de nombreuses erreurs Supabase avalées.

## Suivi des constats

| # | Gravité | Constat | Touche une spec ? | Statut |
| --- | --- | --- | --- | --- |
| C1 | 🔴 | `creer_rencontre_avec_gabarit` sans garde admin, ouverte à `PUBLIC` | Non | À faire |
| M1 | 🟠 | `finaliser_inscription_coach` ouverte à `PUBLIC` | Non | À faire |
| M2 | 🟠 | Coche de contrôle et auteur de saisie falsifiables | Non | À faire |
| M3 | 🟠 | Temps de vitesse de grimpeurs non engagés | Oui (#10 R7 / #7 : sort des temps d'un grimpeur retiré) | À valider |
| M4 | 🟠 | Changement de phase non contrôlé côté serveur | Non (R17 l'exige déjà) | À faire |
| M5 | 🟠 | NP automatique de clôture : échecs silencieux | Non | À faire |
| M6 | 🟠 | Loader du classement : aucune erreur vérifiée (54 lectures dans `src/lib`) | Non | À faire |
| M7 | 🟠 | Plafond de 6 voies en ado non garanti en base | Oui (#6 R14 la dit applicative) | À valider |
| M8 | 🟠 | `service_role` élargi au-delà de l'ADR 0002 | Décision (ADR) | À décider |
| m1–m9 | 🟡 | Mineurs (voir plus bas) | Selon le cas | À faire |

## 🔴 Critique

### C1 — `creer_rencontre_avec_gabarit` sans garde admin, ouverte à `PUBLIC`

- **Où** : `supabase/migrations/202609221500_bareme_vitesse.sql:129`.
- **Constat** : la fonction est `security definer` et insère dans `rencontre`,
  `epreuve`, `voie_difficulte`, `bloc`, `bloc_palier`, `voie_vitesse` et
  `bareme_vitesse_echelon` en contournant la RLS. Elle ne contient **aucun**
  `interclub.est_admin()` ; son seul contrôle porte sur la catégorie. Aucune
  migration ne fait de `revoke` : Postgres laisse donc EXECUTE à `PUBLIC`. Le
  schéma est exposé (`supabase/config.toml:18`) et `usage` est accordé à `anon`.
- **Scénario** : avec la seule clé anon publique (présente dans le bundle JS),
  `POST /rest/v1/rpc/creer_rencontre_avec_gabarit` avec l'en-tête
  `Content-Profile: interclub` crée des rencontres complètes pour n'importe quel
  club, en contournant la policy `rencontre_insert_admin`.
- **Correction** :
  - ajouter `if not interclub.est_admin() then raise exception 'acces_refuse'; end if;` ;
  - `revoke execute … from public;` puis `grant execute … to authenticated;` ;
  - vérifier sur la stack locale par un `curl` avec la clé anon (refus attendu).
- **Règles violées** : convention 03 §3, spec #3 R12.

## 🟠 Majeur

### M1 — `finaliser_inscription_coach` ouverte à `PUBLIC`

- **Où** : `supabase/migrations/202609051000_invitation_coach.sql:93-127`.
- **Constat** : `security definer`, seul `grant execute … to service_role` est
  déclaré, sans `revoke … from public`. Le `search_path` vaut
  `interclub, public` au lieu de `''`.
- **Scénario** : le porteur d'un lien d'invitation ouvre une session anonyme
  (`signInAnonymously`, activé dans `config.toml:55`) puis appelle la RPC. Il
  obtient un mapping coach permanent sans e-mail ni mot de passe, ou rattache le
  compte d'un tiers à un club.
- **Correction** : `revoke execute … from public, anon, authenticated` et
  `set search_path = ''` ; cas « appel anonyme → refus » au cahier.
- **Règles violées** : spec #2 R30–R33, ADR 0002.

### M2 — Coche de contrôle et auteur de saisie falsifiables

- **Où** : `supabase/migrations/202610021000_controle_resultats.sql:34-55`,
  `202609221000_resultat_auteur.sql`, policies `resultat_voie_update` /
  `resultat_bloc_update` (`202609081000…sql`, section 6).
- **Constat** : `controle_le`, `controle_par`, `auteur_utilisateur_id` et
  `auteur_role` sont des colonnes ordinaires. En ③, le coach peut mettre à jour
  toute la ligne ; aucun trigger ni droit par colonne ne les protège.
- **Scénario** : en ③, un coach envoie
  `PATCH resultat_voie?id=eq.X {issue:'top', controle_le:'…', controle_par:'<uuid admin>', auteur_role:'admin'}`.
  En ④, la ligne apparaît « contrôlée par <admin> » ; la coche étant conservée
  (R14), l'admin passe la ligne et un résultat frauduleux devient officiel en ⑤.
  Même chose pour `temps_vitesse.auteur_role` côté juge.
- **Correction** : trigger `before insert or update` sur `resultat_voie`,
  `resultat_bloc` et `temps_vitesse` qui, si l'utilisateur n'est pas admin,
  remet `controle_*` à l'ancienne valeur et force `auteur_*` à `auth.uid()` et
  au rôle réel. Autre option : droits par colonne.
- **Règles violées** : spec #16 R11/R13, spec #9 R14.

### M3 — Temps de vitesse de grimpeurs non engagés

- **Où** : `peut_ecrire_temps_vitesse` (`202607251000_rls_tables_metier.sql:223`),
  recalcul dans `202609221600_points_vitesse_trigger.sql:105-110`,
  `src/lib/juge/vitesse-actions.ts:55-56`.
- **Constat** : seule l'épreuve est vérifiée, sans jointure sur `composition`
  (contrairement à `peut_ecrire_resultat`). Le recalcul fait
  `rank() over (partition by g.sexe order by tv.temps)` sur **tous** les temps
  de l'épreuve. Aucun trigger ne purge les temps quand une composition est
  supprimée.
- **Scénario** : un grimpeur retiré après avoir été chronométré (ou saisi par
  appel direct) garde un temps de 5,0 s et prend le rang 1 : tous les engagés
  de son sexe reculent d'un rang et perdent des points. Le classement masque ce
  grimpeur fantôme mais garde les points décalés.
- **Correction** : exiger dans la policy (ou un trigger) que le grimpeur soit
  composé dans la rencontre ; filtrer par `composition` dans
  `recalculer_points_vitesse`.
- **Règles violées** : spec #10 R7, spec #7 R15. **Touche une spec :
  validation requise.**

### M4 — Changement de phase non contrôlé côté serveur

- **Où** : `src/lib/rencontres/actions.ts:133` et `:159`.
- **Constat** : l'action accepte toute phase valide puis fait `update({ phase })`.
  La phase cible est calculée dans le client (`panneau-pilotage.tsx:65,79`,
  champ caché). `phaseSuivante` / `phasePrecedente` existent dans le domaine mais
  ne servent pas à valider. R17 n'est pas testée.
- **Scénario** : deux admins en ③ ; A passe en ④ (NP posé) ; B, onglet resté en
  ③, clique « Revenir » et envoie `phase=preparation` : passage de ④ à ②. Ou un
  POST direct `phase=resultats_publics` depuis ① publie les résultats.
- **Correction** : fonction de domaine `peutTransiter(courante, cible)` testée
  avec la référence R17 ; relire la phase courante en base dans l'action ;
  éventuellement un trigger SQL.
- **Règle violée** : spec #3 R17 (déjà explicite : seuls tests et code changent).

### M5 — NP automatique de clôture : échecs silencieux

- **Où** : `src/lib/rencontres/cloture.ts:138-146`,
  `src/lib/rencontres/actions.ts:168-171`.
- **Constat** : les deux `upsert` et toutes les lectures ignorent `error`, et
  l'appel est enveloppé dans un `try { … } catch { }` vide. Le commentaire « Le
  NP pourra être reposé » ne correspond à aucun chemin dans l'interface.
- **Scénario** : si la lecture de `compos` échoue, la fonction s'arrête sans
  poser de NP et l'admin voit « Phase : Clôture » en succès. Les attendus non
  saisis manquent au classement officiel.
- **Correction** : vérifier chaque `error`, retirer le `catch` vide, afficher un
  avertissement à l'admin ; idéalement, une RPC transactionnelle pour le
  changement de phase et le NP.
- **Règles violées** : spec #6 R18, conventions 02 §7 et 03 §7.

### M6 — Loader du classement : aucune erreur vérifiée

- **Où** : `src/lib/classement/classement.ts:139-245`.
- **Constat** : aucune des lectures (`rencontre`, `epreuves`, le `Promise.all`
  sur voies, blocs, équipes, paliers, résultats, compositions, points et temps
  de vitesse, `grimpeursRes`) ne teste `.error`. C'est la classe de bug corrigée
  par `202610021100_grant_temps_vitesse_service_role.sql` (« la requête échoue
  silencieusement »).
- **Scénario** : un grant manquant ou une erreur réseau sur `points_vitesse`
  met toutes les vitesses à 0 ; un classement officiel faux est affiché puis
  exporté en PDF, sans alerte.
- **Correction** : `throw` sur `error`, comme `export-classement.ts:50-51`.
  Étendre ensuite aux **54** lectures de `src/lib` qui ignorent `error`, en
  priorité `coach/resultats-actions.ts` (9), `admin/resultats-actions.ts` (9) et
  `admin/controle.ts` (5).
- **Règle violée** : convention 02 §7.

### M7 — Plafond de 6 voies en ado non garanti en base

- **Où** : `src/lib/coach/resultats-actions.ts:174-192`.
- **Constat** : la lecture `existantes` ignore `error` (en cas d'échec, la
  vérification passe). Contrôle et upsert ne sont pas atomiques ; aucun trigger
  n'impose le plafond (`valider_resultat_voie` ne contrôle que R10/R12).
- **Scénario** : deux saisies simultanées (coach et admin), ou un `upsert` direct
  via PostgREST en ③, produisent une 7ᵉ voie qui compte dans le score.
- **Correction** : trigger SQL `count(*) < 6` par grimpeur et épreuve ado ;
  vérifier `error`.
- **Règles violées** : spec #6 R14, convention 03 §2.

### M8 — `service_role` élargi au-delà de l'ADR 0002

- **Où** : `src/lib/supabase/admin.ts:8-11` ; ADR
  `docs/decisions/0002-liste-des-comptes-via-cle-service.md`.
- **Constat** : `createAdminClient` est utilisé par 12 modules (classement,
  contrôle, résultats et engagement admin, prêts, gabarit, jetons, invitations,
  export, mapping…). Ces loaders ne vérifient pas le rôle eux-mêmes et dépendent
  de la garde de la page appelante. Le commentaire de `admin.ts` est périmé.
- **Scénario** : une future page qui appelle `getControleRencontre(id)` sans
  `exigerAdmin` expose toutes les données en contournant la RLS.
- **Options** : (a) nouvel ADR actant l'usage élargi et garde dans chaque loader
  `service_role` ; (b) retour à des lectures soumises à la RLS. Dans les deux
  cas, mettre à jour le commentaire de `admin.ts`.

## 🟡 Mineur

| # | Constat | Où | Correction |
| --- | --- | --- | --- |
| m1 | Pages publiques sans garde (données fictives, mais contraire à « pas d'espace public » et à la spec #12 R2) | `src/app/design-system/page.tsx`, `src/app/templates/nuit/*/page.tsx` | Garde `exigerUtilisateur`, exclusion en prod, ou exception tracée dans la spec #12 |
| m2 | Une session anonyme sans QR est `authenticated` et lit les tables en `using (true)` ou « ③+ » (à confirmer côté produit) | `supabase/config.toml:55`, policies de lecture | Helper SQL `est_acteur_identifie()` (compte ou `session_qr` active) |
| m3 | Redirection ouverte via `chemin` (impact faible grâce au contrôle d'origine de Next) | `src/lib/jetons/actions.ts:34,41`, `src/lib/invitations/actions.ts:83,87` | N'accepter que les chemins relatifs commençant par `/` |
| m4 | Un coach peut réactiver un jeton QR révoqué par l'admin (à confirmer avec la spec #2 R22/R23) | `202607230900_rls_jeton_qr_et_grants.sql:72-83` | Restreindre les colonnes modifiables par la policy |
| m5 | `/scan` ouvre une session anonyme même si l'utilisateur est connecté, et lui fait perdre sa session permanente | `src/app/scan/scan-qr.tsx:44` | Ne pas ouvrir de session anonyme si déjà connecté |
| m6 | Toute erreur de `createUser` est présentée comme « Un compte existe déjà » | `src/lib/invitations/actions.ts:221-226` | Distinguer les causes d'erreur |
| m7 | ~100 lignes dupliquées entre admin et coach ; fonction locale `exigerAdmin` homonyme de la garde de `session.ts`, avec une autre sémantique | `src/lib/admin/resultats-actions.ts:34`, `src/lib/coach/resultats-actions.ts` | Factoriser dans un module commun, renommer la fonction locale |
| m8 | `basculerControle(type)` traite toute valeur autre que `'voie'` comme `'bloc'` ; lectures sans `error` | `src/lib/admin/controle-actions.ts:19-30` | Valider `type`, vérifier `error` |
| m9 | Variable `_` inutilisée (avertissement du lint) | `src/domaine/grimpeur.test.ts:36` | Corriger |

## 💡 Suggestions

1. **Fermer par défaut les nouvelles fonctions** :
   `alter default privileges in schema interclub revoke execute on functions from public;`.
2. **Ajouter au cahier une série « appel PostgREST direct »** : RPC appelée en
   anonyme, PATCH des colonnes d'audit, temps de vitesse pour un grimpeur non
   engagé.
3. **Préfixer les tests par leur spec**, par exemple `describe('spec #7 R8 …')`,
   pour une traçabilité sans ambiguïté.
4. **Tester les règles calculées en SQL** (rang et points de vitesse, plafond
   ado, NP) : tests pgTAP sur la stack locale, ou copie de ces règles dans le
   domaine avec tests d'équivalence Vitest.

## Couverture spec ↔ tests

Approximation : les tests citent souvent les règles `Rn` sans numéro de spec.

| Spec | Testées (Vitest) | Non testées en Vitest | Écarts relevés |
| --- | --- | --- | --- |
| #2 Auth / QR | R1–R5, R9–R33 (partiel) | — | RPC d'inscription ouverte à tous (M1) |
| #3 Paramétrage | R12, R30–R39, R43, R46–R48 | **R17** | R17 non contrôlée côté serveur (M4) |
| #6 Saisie | R9–R14, R16, R18, R20, R21bis | R1–R8, R15, R17, R19, R22–R25 (accès et IHM, cahier 17) | R14 non garantie en base (M7) |
| #7 Classement | R1–R9, R8b, R17, R18, R20 | **R15, R16, R19** (SQL uniquement) ; R10–R14 (loader et IHM, cahiers 18 et 21) | Grimpeurs non engagés dans la vitesse (M3) |
| #10 Vitesse juge | R7, R8, R10, R11, R13 | R1–R6, R9, R12, R14–R17 (garde, RLS et IHM, cahier 20) | R7 non imposée en base (M3) |
| #13 Import | R4, R6–R10, R14 | R11–R13, R16 (RPC SQL, cahier 24) | — |
| #14 Écran secondaire | R4–R6 | R1–R3, R7–R12 (IHM, cahier 25) | — |
| #15 Export PDF | R1–R5, R9–R20 | R6–R8 (route, cahier 26) | — |
| #16 Contrôle | R2, R3, R5, R7–R9, R11, R13 | R10, R12, R12bis, R14–R18 | Coche falsifiable (M2) |

Aucun test sans règle n'a été trouvé. Les règles d'accès (RLS, auth, realtime)
sont renvoyées aux cahiers 02–27 et aux E2E, conformément à la convention.

## Questions d'architecture

1. **`service_role` en lecture transverse ou RLS ?** Formaliser l'élargissement
   par un nouvel ADR (et imposer une garde dans chaque loader), ou revenir aux
   lectures RLS maintenant que les policies « ③+ » existent.
2. **Anonyme Supabase = `authenticated`.** La décision « pas d'espace public »
   suppose qu'« authentifié » signifie « compte ou session QR ». Faut-il un
   helper `est_acteur_identifie()` dans les policies de lecture ?
3. **Règles du règlement en SQL.** Le trigger des points de vitesse, le plafond
   ado et le NP de clôture forment une seconde source de vérité, hors de
   `src/domaine/` (convention 02 §6) et non testée unitairement. Tests pgTAP, ou
   copie dans le domaine avec tests d'équivalence ?

## Résultats outillés

| Outil | Résultat |
| --- | --- |
| `npm run typecheck` | OK, aucune erreur |
| `npm run lint` | 0 erreur, 1 avertissement (`grimpeur.test.ts:36`, variable `_` inutilisée) |
| `npm test` | OK : 19 fichiers, 326 tests (7,08 s) |
| `npm run lint:md` | OK : 77 fichiers, 0 erreur |

Ni E2E ni commande touchant une base n'ont été lancés ; aucun fichier n'a été
modifié pendant la revue.
