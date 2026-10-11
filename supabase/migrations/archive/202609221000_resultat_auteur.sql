-- ===========================================================================
-- 202609221000_resultat_auteur
--
-- Objet : traçabilité de l'AUTEUR des résultats (spec #9 R14). Ajoute sur
--         `resultat_voie` ET `resultat_bloc` de quoi savoir « qui a saisi/corrigé
--         quoi » : l'utilisateur auth et son rôle au moment de l'écriture.
--         Prérequis de la saisie/correction admin (spec #9) ; renseigné aussi par
--         la saisie coach (spec #6).
--
-- Choix de modélisation : on référence `auth.users(id)` (et NON `interclub.compte`)
--         car le COACH TEMPORAIRE écrit via une session ANONYME (QR) SANS ligne
--         `compte` (spec #1 R9/R27) ; seul `auth.users` couvre tous les auteurs
--         (admin, coach permanent, coach temporaire). Le rôle effectif est stocké
--         à part dans `auteur_role` ('admin' | 'coach').
--
-- Nullable : colonnes optionnelles — aucun rétro-remplissage des résultats
--         existants. `on delete set null` : la suppression d'un compte auth ne
--         supprime pas le résultat (audit conservé, auteur devenu inconnu).
--
-- Audit seul : ces colonnes n'entrent NI dans le score NI dans les classements
--         (spec #7) ; pas de RLS ni de grant spécifiques (les privilèges de table
--         couvrent les nouvelles colonnes).
--
-- Idempotent : `add column if not exists`, `drop constraint if exists`.
-- ===========================================================================

-- resultat_voie
alter table interclub.resultat_voie
  add column if not exists auteur_utilisateur_id uuid
    references auth.users (id) on delete set null,
  add column if not exists auteur_role text;

alter table interclub.resultat_voie
  drop constraint if exists resultat_voie_auteur_role_check;
alter table interclub.resultat_voie
  add constraint resultat_voie_auteur_role_check
  check (auteur_role is null or auteur_role in ('admin', 'coach'));

-- resultat_bloc
alter table interclub.resultat_bloc
  add column if not exists auteur_utilisateur_id uuid
    references auth.users (id) on delete set null,
  add column if not exists auteur_role text;

alter table interclub.resultat_bloc
  drop constraint if exists resultat_bloc_auteur_role_check;
alter table interclub.resultat_bloc
  add constraint resultat_bloc_auteur_role_check
  check (auteur_role is null or auteur_role in ('admin', 'coach'));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609221000_resultat_auteur',
  'Traçabilité de l''auteur des résultats (spec #9 R14) : colonnes auteur_utilisateur_id (→ auth.users, couvre le coach temporaire anonyme) et auteur_role (admin|coach) sur resultat_voie/resultat_bloc, nullable, audit seul (hors score/classement).',
  'julleroyfr'
)
on conflict (version) do nothing;
