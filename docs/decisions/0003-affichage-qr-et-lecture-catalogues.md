# ADR 0003 — Affichage des jetons QR & lecture des catalogues (T5c)

- **Statut** : acceptée (le 2026-07-23)
- **Décideurs** : julleroyfr (produit) + assistance technique
- **Portée** : écrans de gestion des jetons QR (T5c), admin + coach permanent
- **Sources** :
  - [`docs/specs/02-authentification-et-sessions-qr.md`](../specs/02-authentification-et-sessions-qr.md)
    (R15–R23 ; **« format graphique et canal d'affichage du QR » hors périmètre**)
  - [ADR 0002](0002-liste-des-comptes-via-cle-service.md) (lecture d'administration
    via `service_role`, écriture via RLS)

## Contexte

T5c permet de générer / afficher / révoquer / régénérer les jetons QR (R15–R23).
La spec laisse le **format d'affichage du QR** hors périmètre, et les écrans ont
besoin de lire des **catalogues** (rencontres, voies de vitesse, clubs engagés)
qui ne sont **pas encore ouverts en RLS** `authenticated` (leurs policies relèvent
de **T6**).

## Décision

### 1. Affichage : vrai QR code, généré côté serveur

Rendre un **vrai QR code scannable** à partir de `jeton_qr.valeur`, encodé en
**data URL PNG côté serveur** (lib `qrcode`, `QRCode.toDataURL`) et affiché en
`<img>`. Le QR encode aujourd'hui la **valeur brute** (secret) ; le **format
d'URL de scan** (p. ex. `/scan?jeton=…`) sera fixé en **T5d** (ouverture de
session), sans impact sur le modèle.

### 2. Lecture des catalogues via `service_role`, écriture via RLS

- Les **catalogues** (rencontre, voie_vitesse, clubs engagés via equipe) sont lus
  par le client **`service_role`** (loaders `server-only`), en **prolongement de
  l'ADR 0002**. Pour l'écran **coach**, la lecture est **scopée en code** au club
  du compte connecté (`getUtilisateurCourant().clubId`) : le `service_role`
  contourne la RLS, mais ne renvoie que les rencontres du club du coach.
- Les **jetons** (`jeton_qr`) sont lus **via la RLS** (`authenticated`) : l'admin
  voit tout, le coach voit les `coach_temporaire` de son club (policies T5c).
- Les **écritures** (génération, révocation, régénération) passent **par la RLS**
  (client `authenticated`) — vraie frontière (R15/R16/R20/R21), doublée d'une
  garde applicative `peutGererJeton` (domaine).

### Garde-fous

- La lecture `service_role` reste **derrière une garde de rôle** : `/admin/jetons`
  exige admin (`notFound()` sinon), `/coach/jetons` exige coach + club.
- Même si une lecture `service_role` sur-cadrait, **l'écriture est protégée par la
  RLS** : un coach ne peut insérer/modifier que le jeton `coach_temporaire` de son
  club, jamais un jeton juge (R17) ni un autre club.

## Conséquences

### Positives

- QR réellement scannable, cohérent avec l'usage terrain (afficher à l'écran).
- Réutilise le pattern ADR 0002 : aucune nouvelle surface de sécurité, écriture
  100 % RLS.

### Négatives / points de vigilance

- Nouvelle dépendance `qrcode` (+ `@types/qrcode`).
- Lecture des catalogues via `service_role` = **contournement temporaire** de la
  RLS non encore posée : à remplacer par des policies de lecture propres en **T6**,
  puis rebasculer ces lectures sur le client `authenticated`.
- Le QR encode la valeur brute ; **T5d** formalisera l'URL de scan.

## Suite

- **T5d** : définir l'URL de scan encodée dans le QR + ouverture de session.
- **T6** : policies de lecture de rencontre / voie_vitesse / equipe / club, puis
  retrait des lectures `service_role` de ces catalogues.
