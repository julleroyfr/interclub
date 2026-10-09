# ADR 0005 — Lecture transverse via `service_role`, gardée dans chaque loader

- **Statut** : acceptée (le 2026-10-03) — décision **D-C** de la
  [revue globale du 2026-10-03](../revues/2026-10-03-plan-action.md) (constat M8)
- **Décideurs** : julleroyfr (produit) + assistance technique
- **Portée** : tous les loaders serveur qui utilisent `createAdminClient`
  (`src/lib/supabase/admin.ts`) ; **étend** les ADR 0002 et 0003
- **Sources** :
  - [ADR 0002](0002-liste-des-comptes-via-cle-service.md) (lecture d'administration
    via `service_role`, écriture via RLS — portée initiale : le mapping de rôle)
  - [ADR 0003](0003-affichage-qr-et-lecture-catalogues.md) (catalogues des écrans
    de jetons, lecture scopée en code pour le coach)
  - [`docs/conventions/00-architecture.md`](../conventions/00-architecture.md) §2
    (la sécurité vit dans la base ; Server Actions et pages vérifient en interne)
  - [`docs/specs/12-navigation-et-routing.md`](../specs/12-navigation-et-routing.md)
    (gardes d'espace `exigerAdmin`, `exigerContexteCoach`)

## Contexte

Les ADR 0002 et 0003 limitaient `service_role` à des lectures d'administration
précises (comptes, catalogues des jetons). Depuis, son usage s'est étendu **de
fait** à 12 loaders (classement, contrôle, saisie admin, engagement et prêts tous
clubs, gabarit, invitations, jetons…) : ces écrans assemblent des données **de
tous les clubs** (noms des grimpeurs et des clubs, résultats, compositions) que la
RLS n'ouvre volontairement pas à un `authenticated` ordinaire.

La revue du 2026-10-03 (M8) a relevé deux problèmes :

1. cet élargissement n'était **pas décidé** (aucun ADR ne le couvrait) ;
2. ces loaders **ne vérifiaient pas eux-mêmes** le rôle : ils dépendaient
   entièrement de la garde de la page appelante. Une future page qui oublierait
   `exigerAdmin` exposerait toutes les données, la RLS étant contournée.

Deux voies ont été pesées : (a) acter la lecture transverse et garder chaque
loader ; (b) revenir à des lectures RLS en ouvrant des policies cross-club.

## Décision

**Option (a)** — la lecture transverse via `service_role` est **acceptée** pour les
écrans qui en ont besoin, à trois conditions :

1. **Lecture seule.** Toute **écriture** passe par le client `authenticated` et la
   RLS (inchangé depuis l'ADR 0002), sauf les exceptions listées plus bas.
2. **Garde dans chaque loader.** Toute fonction exportée de `src/lib` qui lit via
   `service_role` — directement ou via un helper local — **commence** par une garde
   de lecture (`src/lib/auth/garde-lecture.ts`) :

   | Garde | Autorise | Loaders |
   | --- | --- | --- |
   | `exigerLectureAdmin` | admin | contrôle, saisie admin, engagement et prêts tous clubs, mapping, gabarit, invitations actives, catalogues des jetons admin |
   | `exigerLectureAdminOuCoach` | admin, coach permanent ou temporaire | classement d'une rencontre |
   | `exigerLectureCoachDuClub(clubId)` | admin, coach permanent du club | rencontres du club (jetons coach) |

   La garde **lève une erreur** (`LectureNonAutoriseeError`) au lieu de faire
   `notFound()` : un loader peut servir une route (export PDF), et un appel non
   autorisé à ce niveau est une erreur de programmation — la page doit avoir
   refusé avant. C'est une **défense en profondeur**, pas un remplacement des
   gardes de page de la spec #12.
3. **Contrôle automatique.** Le test d'architecture
   `src/lib/supabase/garde-service-role.test.ts` échoue si une fonction exportée
   utilisant `service_role` n'appelle aucune garde et ne figure pas dans la liste
   d'exceptions. Toute nouvelle lecture `service_role` doit donc choisir une garde
   ou s'inscrire ici comme exception.

### Exceptions (sans garde de rôle)

| Fonction | Justification |
| --- | --- |
| `resoudreInvitation` | page d'inscription **publique** : l'accès repose sur la possession du **secret** de l'invitation (spec #2 R26–R33) |
| `inscrireCoach` | crée le compte et le mapping coach **avant toute session**, sur présentation du secret (spec #2 R30–R33) ; écrit via `service_role` (API Auth admin + RPC réservée à `service_role`) |
| `resoudreInvitationAdmin` | page d'inscription **publique** : l'accès repose sur la possession du **secret** de l'invitation administrateur (spec #2 R35–R39, ajout du 2026-10-09) |
| `inscrireAdmin` | crée le compte et le mapping admin **avant toute session**, sur présentation du secret (spec #2 R36–R39, ajout du 2026-10-09) ; écrit via `service_role` (API Auth admin + RPC `finaliser_inscription_admin` réservée à `service_role`) |
| `exportDisponible`, `reponseExportPdf` | autorisation par le **demandeur** résolu côté serveur (`demandeurAdmin` / `demandeurCoach`) et `peutExporter` (spec #15 R1–R5) ; le PDF lui-même passe par `getClassementRencontre`, gardé |

## Conséquences

### Positives

- La sécurité des écrans transverses ne dépend plus d'une seule garde (la page) :
  oublier `exigerAdmin` sur une nouvelle page ne divulgue plus rien.
- La règle est **vérifiée par un test** : l'élargissement ne peut plus se faire
  en silence.
- Aucun changement de RLS ni de migration ; aucun coût de lecture supplémentaire
  (les gardes réutilisent les résolutions de session mémorisées par requête).

### Négatives / points de vigilance

- `service_role` reste soumis aux **GRANTs** de table : toute nouvelle table lue
  doit lui être accordée (cf. incidents `202609181100`, `202610021100`). Une
  lecture en échec lève une erreur (`verifierLecture`, lot 2 de la revue).
- Le test d'architecture repose sur une analyse textuelle (`function nom(`) :
  une lecture `service_role` écrite sous une autre forme (fonction fléchée
  exportée) lui échapperait. Convention : écrire les loaders en
  `export async function`.
- La clé `SUPABASE_SERVICE_ROLE_KEY` reste un secret serveur (`server-only`,
  jamais `NEXT_PUBLIC_`), comme dans l'ADR 0002.

## Alternatives considérées

- **(b) Retour aux lectures RLS** — écartée : il faudrait ouvrir en RLS des
  lectures cross-club (noms des grimpeurs et des clubs de toute la rencontre) que
  la matrice de la spec #1 ferme volontairement, ou multiplier les fonctions
  `SECURITY DEFINER` dédiées ; gros chantier pour un gain de sécurité inférieur à
  celui des gardes testées.
