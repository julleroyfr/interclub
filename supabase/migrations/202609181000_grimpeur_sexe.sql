-- ===========================================================================
-- 202609181000_grimpeur_sexe
--
-- Objet : ajouter le sexe du grimpeur, prérequis du classement individuel
--         séparé Filles / Garçons (spec #7 « Classement » R8b, validée le
--         2026-09-18). Champ mutualisé avec l'itération vitesse/sexe (les points
--         de vitesse sont attribués par rang dans un classement par sexe, §5/§8
--         du règlement CT33) : c'est cette composante qui fonde la séparation.
--
-- Cadrage (spec #7, Contraintes de données) : `sexe` est OBLIGATOIRE, valeurs
--         'F' (Filles) / 'G' (Garçons) — tout grimpeur relève de l'un des deux
--         classements, aucun cas « sans sexe ».
--
-- Backfill : la colonne est d'abord ajoutée NULLABLE pour permettre de renseigner
--         le sexe des grimpeurs EXISTANTS avant de poser la contrainte NOT NULL.
--         - En local (Docker) : la table est vide au moment des migrations (le
--           seed s'applique après), donc rien à backfiller ; le seed porte le
--           sexe des grimpeurs de test (cf. supabase/seed/01-jeu-de-test.sql).
--         - En recette / prod (application manuelle) : RENSEIGNER À LA MAIN le
--           sexe ('F'/'G') de chaque grimpeur existant AVANT de rejouer l'étape
--           NOT NULL. Le garde-fou ci-dessous refuse de continuer tant qu'il
--           reste un grimpeur sans sexe (aucune valeur par défaut fiable).
--
-- RLS : aucune nouvelle policy — `sexe` est une colonne de `grimpeur`, couverte
--         par les policies de la table (les grants table valent pour la colonne).
--
-- Idempotent : `add column if not exists`, garde-fou avant NOT NULL,
--         `drop constraint if exists` avant la contrainte finale.
-- ===========================================================================

-- 1. Colonne sexe — d'abord nullable (fenêtre de backfill).
alter table interclub.grimpeur
  add column if not exists sexe text;

-- 2. Backfill des grimpeurs existants.
--    Local : table vide → aucune ligne touchée. Recette/prod : renseigner ici
--    (ou via le SQL Editor) le sexe des grimpeurs déjà en base avant l'étape 3.
--    (Les grimpeurs de test sont dotés d'un sexe par le seed, pas par la migration.)

-- 3. Garde-fou : interdit de poser NOT NULL s'il reste des grimpeurs sans sexe.
do $$
begin
  if exists (select 1 from interclub.grimpeur where sexe is null) then
    raise exception
      'Des grimpeurs sans sexe subsistent : renseigner ''F''/''G'' pour chacun avant de poser NOT NULL (spec #7 R8b).';
  end if;
end
$$;

-- 4. Contrainte définitive : obligatoire + valeurs bornées à 'F' / 'G'.
alter table interclub.grimpeur
  alter column sexe set not null;

alter table interclub.grimpeur
  drop constraint if exists grimpeur_sexe_check;

alter table interclub.grimpeur
  add constraint grimpeur_sexe_check check (sexe in ('F', 'G'));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609181000_grimpeur_sexe',
  'Ajout de grimpeur.sexe (''F''/''G'', NOT NULL) — prérequis du classement individuel séparé par sexe (spec #7 R8b). Colonne ajoutée nullable pour backfill, garde-fou avant NOT NULL, contrainte finale grimpeur_sexe_check.',
  'julleroyfr'
)
on conflict (version) do nothing;
