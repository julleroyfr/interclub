-- ===========================================================================
-- 202609011100_composition_engagement
--
-- Objet : deux évolutions de `interclub.composition` pour l'espace coach
--         (spec #5) :
--   1. R14 — un grimpeur ne peut appartenir qu'à UNE équipe par rencontre.
--      La PK (equipe_id, grimpeur_id) ne borne qu'au sein d'une équipe. On
--      dénormalise `rencontre_id` (rempli par trigger depuis `equipe`, cohérence
--      garantie) et on pose `unique (rencontre_id, grimpeur_id)`.
--   2. R19 — groupe de départ (rencontres enfant) : colonne `groupe_depart`
--      NULLABLE (optionnel, sans objet pour l'ado). Valeurs = niveaux de départ
--      M1–M4 / T1–T8 (T9/T10 exclus, ne laissent pas 3 voies croissantes, R20).
--
-- Écriture du groupe de départ : édition possible après l'ajout (« à définir »
--         puis complété). On accorde donc un GRANT UPDATE **colonne**
--         `groupe_depart` seulement + une policy `composition_update`. Comme
--         `peut_ecrire_composition` s'appuie sur `peut_ecrire_equipe`,
--         l'écriture reste bornée au coach permanent en phase ① (ou admin) —
--         cohérent avec le gel de l'engagement (voir migration RLS suivante).
--
-- Idempotent : add-column-if-not-exists, drop-if-exists des contraintes/policy/
--         trigger avant (re)création, create-index-if-not-exists.
--
-- ⚠ Pré-requis données : la contrainte d'unicité échoue si un grimpeur figure
--    déjà dans 2 équipes d'une même rencontre. Corriger les données avant.
-- ===========================================================================

-- --- 1. Dénormalisation rencontre_id + unicité (R14) -----------------------

alter table interclub.composition
  add column if not exists rencontre_id uuid;

-- Trigger : rencontre_id est TOUJOURS dérivé de l'équipe (jamais saisi).
create or replace function interclub.composition_set_rencontre_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select e.rencontre_id
    into new.rencontre_id
    from interclub.equipe e
   where e.id = new.equipe_id;
  return new;
end;
$$;

drop trigger if exists trg_composition_rencontre_id on interclub.composition;
create trigger trg_composition_rencontre_id
  before insert or update of equipe_id on interclub.composition
  for each row execute function interclub.composition_set_rencontre_id();

-- Reprise des lignes existantes puis passage NOT NULL.
update interclub.composition c
   set rencontre_id = e.rencontre_id
  from interclub.equipe e
 where e.id = c.equipe_id
   and c.rencontre_id is distinct from e.rencontre_id;

alter table interclub.composition
  alter column rencontre_id set not null;

alter table interclub.composition
  drop constraint if exists composition_rencontre_id_fkey;
alter table interclub.composition
  add constraint composition_rencontre_id_fkey
  foreign key (rencontre_id) references interclub.rencontre (id) on delete cascade;

create index if not exists idx_composition_rencontre_id
  on interclub.composition (rencontre_id);

-- R14 : un grimpeur = une seule équipe par rencontre.
alter table interclub.composition
  drop constraint if exists composition_rencontre_grimpeur_key;
alter table interclub.composition
  add constraint composition_rencontre_grimpeur_key
  unique (rencontre_id, grimpeur_id);

-- --- 2. Groupe de départ (R19) ---------------------------------------------

alter table interclub.composition
  add column if not exists groupe_depart text;

-- Vocabulaire des niveaux de DÉPART (défense en profondeur ; la pertinence
-- « enfant uniquement » est portée par le domaine + Server Action). T9/T10 exclus.
alter table interclub.composition
  drop constraint if exists composition_groupe_depart_check;
alter table interclub.composition
  add constraint composition_groupe_depart_check
  check (
    groupe_depart is null
    or groupe_depart in (
      'M1', 'M2', 'M3', 'M4',
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'
    )
  );

-- Édition du seul groupe de départ (colonne) par le coach, bornée par la RLS.
grant update (groupe_depart) on interclub.composition to authenticated;

drop policy if exists "composition_update" on interclub.composition;
create policy "composition_update" on interclub.composition for update
  to authenticated
  using (interclub.est_admin() or interclub.peut_ecrire_composition(equipe_id, grimpeur_id))
  with check (interclub.est_admin() or interclub.peut_ecrire_composition(equipe_id, grimpeur_id));

-- ===========================================================================
-- Suivi de version
-- ===========================================================================

insert into interclub.version (version, description, applique_par)
values (
  '202609011100_composition_engagement',
  'composition : rencontre_id dénormalisé (trigger depuis equipe) + unique(rencontre_id, grimpeur_id) (R14, un grimpeur = 1 équipe/rencontre) ; colonne groupe_depart nullable + check M1–M4/T1–T8 (R19) + grant update(groupe_depart) et policy composition_update (spec #5).',
  'julleroyfr'
)
on conflict (version) do nothing;
